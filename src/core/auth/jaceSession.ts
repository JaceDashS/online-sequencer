/**
 * jace-s 로그인 세션
 *
 * - 로그인 쿠키는 jace-s API(https://api.jace-s.com)에만 있다.
 * - 세션 확인: GET {API_URL}/auth/session, credentials: 'include'
 *   200 → { user, isAdmin, adminAccess, csrfToken(문자열 또는 null), ... }, 401 → 로그아웃
 *   isAdmin은 jace-s 메인 사이트와 같은 판단 기준이다(관리 메뉴를 하나라도 볼 수 있음). 화면 표시용이며 권한 판정은 서버가 한다.
 * - 로그인 상태의 변경 요청(POST/PUT/PATCH/DELETE): credentials: 'include' + 헤더 x-csrf-token
 *   (CSRF가 없거나 틀리면 403 CSRF_VALIDATION_FAILED)
 * - 비로그인 사용자는 쿠키와 CSRF 헤더 없이 요청한다.
 *   (쿠키는 이 페이지에서 읽을 수 없으므로 세션 응답 본문의 csrfToken을 쓴다)
 * - 로그인 화면: {SITE_URL}/login 을 새 창으로 열고, 창이 닫히거나 포커스가 돌아오면 세션을 다시 확인
 * - 로그아웃은 {SITE_URL}/account 화면에서 한다.
 * - 로그인은 서버 허용 Origin(online-sequencer.jace-s.com)에서만 동작하므로 그 밖에서는 비활성화한다.
 */

import type { IHttpRequestOptions } from '../../transport/types';
import { getTransport } from '../../transport';
import { getApiUrl, getSiteUrl, isLoginAvailable } from '../../utils/apiConfig';

export type JaceSessionStatus = 'unavailable' | 'unknown' | 'checking' | 'signed-in' | 'signed-out';

export interface JaceSessionUser {
  [key: string]: unknown;
}

export interface JaceSessionState {
  status: JaceSessionStatus;
  user: JaceSessionUser | null;
  csrfToken: string | null;
  /** jace-s 관리 메뉴를 하나라도 볼 수 있는 계정인지 (화면 표시용) */
  isAdmin: boolean;
}

const SESSION_TIMEOUT_MS = 10_000;
const LOGIN_WINDOW_POLL_MS = 500;
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

type Listener = (state: JaceSessionState) => void;

let state: JaceSessionState = {
  status: isLoginAvailable() ? 'unknown' : 'unavailable',
  user: null,
  csrfToken: null,
  isAdmin: false,
};
const listeners = new Set<Listener>();
let inflight: Promise<JaceSessionState> | null = null;

function setState(next: JaceSessionState): void {
  state = next;
  listeners.forEach((listener) => {
    try {
      listener(state);
    } catch (error) {
      console.error('[jaceSession] listener error:', error);
    }
  });
}

export function getJaceSession(): JaceSessionState {
  return state;
}

export function subscribeJaceSession(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * 세션 응답(200) 본문을 해석합니다. user 객체가 없으면 로그인 상태로 보지 않습니다.
 * csrfToken은 계약상 null일 수 있습니다(CSRF 쿠키가 다른 세션의 것일 때). 이때는 로그인 상태로 표시하되
 * 변경 요청에 쿠키·CSRF를 붙이지 않습니다(비로그인 요청으로 처리).
 */
export function parseSessionPayload(payload: unknown): Pick<JaceSessionState, 'user' | 'csrfToken' | 'isAdmin'> | null {
  if (!payload || typeof payload !== 'object') return null;
  const body = payload as { user?: unknown; csrfToken?: unknown; isAdmin?: unknown };
  if (!body.user || typeof body.user !== 'object') return null;
  return {
    user: body.user as JaceSessionUser,
    csrfToken: typeof body.csrfToken === 'string' && body.csrfToken ? body.csrfToken : null,
    isAdmin: body.isAdmin === true,
  };
}

/**
 * 표시용 사용자 이름을 고릅니다.
 */
export function getSessionDisplayName(user: JaceSessionUser | null): string {
  if (!user) return '';
  for (const key of ['name', 'displayName', 'nickname', 'username', 'email']) {
    const value = user[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

/**
 * 세션을 확인합니다. 로그인 사용 불가 환경에서는 요청하지 않습니다.
 */
export function refreshJaceSession(): Promise<JaceSessionState> {
  if (!isLoginAvailable()) {
    if (state.status !== 'unavailable') {
      setState({ status: 'unavailable', user: null, csrfToken: null, isAdmin: false });
    }
    return Promise.resolve(state);
  }
  if (inflight) return inflight;

  setState({ ...state, status: state.status === 'signed-in' ? 'signed-in' : 'checking' });

  inflight = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SESSION_TIMEOUT_MS);
    try {
      const response = await getTransport().request({
        url: `${getApiUrl()}/auth/session`,
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        signal: controller.signal,
      });
      if (response.status === 200) {
        const parsed = parseSessionPayload(await response.json());
        setState(parsed
          ? { status: 'signed-in', ...parsed }
          : { status: 'signed-out', user: null, csrfToken: null, isAdmin: false });
      } else if (response.status === 401) {
        setState({ status: 'signed-out', user: null, csrfToken: null, isAdmin: false });
      } else {
        // 서버 오류: 로그인 여부를 판단할 수 없음
        setState({ status: 'unknown', user: null, csrfToken: null, isAdmin: false });
      }
    } catch {
      setState({ status: 'unknown', user: null, csrfToken: null, isAdmin: false });
    } finally {
      clearTimeout(timer);
      inflight = null;
    }
    return state;
  })();

  return inflight;
}

/**
 * jace-s 화면(로그인·계정)을 새 창으로 엽니다.
 * 창이 닫히거나 이 페이지로 포커스가 돌아오면 세션을 다시 확인합니다.
 */
function openJaceWindow(path: '/login' | '/account'): void {
  if (!isLoginAvailable() || typeof window === 'undefined') return;

  const loginWindow = window.open(`${getSiteUrl()}${path}`, `jace-s${path.replace('/', '-')}`);

  let finished = false;
  let poll: ReturnType<typeof setInterval> | undefined;
  const finish = () => {
    if (finished) return;
    finished = true;
    if (poll !== undefined) clearInterval(poll);
    window.removeEventListener('focus', onFocus);
    void refreshJaceSession();
  };
  const onFocus = () => finish();

  window.addEventListener('focus', onFocus);
  if (loginWindow) {
    poll = setInterval(() => {
      if (loginWindow.closed) finish();
    }, LOGIN_WINDOW_POLL_MS);
  }
}

/** jace-s 로그인 화면({SITE_URL}/login)을 새 창으로 엽니다. */
export function openJaceLoginWindow(): void {
  openJaceWindow('/login');
}

/** jace-s 계정 화면({SITE_URL}/account, 로그아웃 포함)을 새 창으로 엽니다. */
export function openJaceAccountWindow(): void {
  openJaceWindow('/account');
}

/**
 * jace-s API 요청에 로그인 쿠키와 CSRF 토큰을 붙입니다.
 *
 * 허용 Origin에서 로그인한 상태일 때만 credentials를 포함하고, 변경 요청에는 x-csrf-token을 붙입니다.
 * 비로그인 상태나 허용 Origin 밖에서는 요청을 바꾸지 않습니다.
 */
export function withJaceAuth<T extends Pick<IHttpRequestOptions, 'method' | 'headers' | 'credentials'>>(options: T): T {
  if (!isLoginAvailable() || state.status !== 'signed-in' || !state.csrfToken) return options;

  const method = (options.method || 'GET').toUpperCase();
  const headers = { ...(options.headers || {}) };
  if (MUTATING_METHODS.has(method)) {
    headers['x-csrf-token'] = state.csrfToken;
  }
  return { ...options, credentials: 'include', headers };
}
