/**
 * jace-s 로그인 세션
 *
 * - 로그인 쿠키는 jace-s API origin(https://api.jace-s.com)에만 있다.
 * - 세션 확인: GET {apiOrigin}/api/auth/session, credentials: 'include'
 *   200 → { user, csrfToken, ... }, 401 → 로그아웃
 * - 변경 요청(POST/PUT/PATCH/DELETE): credentials: 'include' + 헤더 x-csrf-token
 *   (쿠키는 이 페이지에서 읽을 수 없으므로 세션 응답 본문의 csrfToken을 쓴다)
 * - 로그인 화면: {siteUrl}/login 을 새 창으로 열고, 창이 닫히거나 포커스가 돌아오면 세션을 다시 확인
 * - 로그인은 서버 허용 Origin(online-sequencer.jace-s.com)에서만 동작하므로 그 밖에서는 비활성화한다.
 */

import type { IHttpRequestOptions } from '../../transport/types';
import { getTransport } from '../../transport';
import { getApiOrigin, getSiteUrl, isLoginAvailable } from '../../utils/apiConfig';

export type JaceSessionStatus = 'unavailable' | 'unknown' | 'checking' | 'signed-in' | 'signed-out';

export interface JaceSessionUser {
  [key: string]: unknown;
}

export interface JaceSessionState {
  status: JaceSessionStatus;
  user: JaceSessionUser | null;
  csrfToken: string | null;
}

const SESSION_TIMEOUT_MS = 10_000;
const LOGIN_WINDOW_POLL_MS = 500;
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

type Listener = (state: JaceSessionState) => void;

let state: JaceSessionState = {
  status: isLoginAvailable() ? 'unknown' : 'unavailable',
  user: null,
  csrfToken: null,
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
 * 세션 응답 본문을 해석합니다. csrfToken이 없으면 로그인 상태로 보지 않습니다.
 */
export function parseSessionPayload(payload: unknown): Pick<JaceSessionState, 'user' | 'csrfToken'> | null {
  if (!payload || typeof payload !== 'object') return null;
  const body = payload as { user?: unknown; csrfToken?: unknown };
  if (typeof body.csrfToken !== 'string' || !body.csrfToken) return null;
  const user = body.user && typeof body.user === 'object' ? (body.user as JaceSessionUser) : {};
  return { user, csrfToken: body.csrfToken };
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
      setState({ status: 'unavailable', user: null, csrfToken: null });
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
        url: `${getApiOrigin()}/api/auth/session`,
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        signal: controller.signal,
      });
      if (response.status === 200) {
        const parsed = parseSessionPayload(await response.json());
        setState(parsed
          ? { status: 'signed-in', ...parsed }
          : { status: 'signed-out', user: null, csrfToken: null });
      } else if (response.status === 401) {
        setState({ status: 'signed-out', user: null, csrfToken: null });
      } else {
        // 서버 오류: 로그인 여부를 판단할 수 없음
        setState({ status: 'unknown', user: null, csrfToken: null });
      }
    } catch {
      setState({ status: 'unknown', user: null, csrfToken: null });
    } finally {
      clearTimeout(timer);
      inflight = null;
    }
    return state;
  })();

  return inflight;
}

/**
 * jace-s 로그인 화면을 새 창으로 엽니다.
 * 창이 닫히거나 이 페이지로 포커스가 돌아오면 세션을 다시 확인합니다.
 */
export function openJaceLoginWindow(): void {
  if (!isLoginAvailable() || typeof window === 'undefined') return;

  const loginWindow = window.open(`${getSiteUrl()}/login`, 'jace-s-login');

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

/**
 * jace-s API 요청에 로그인 쿠키와 CSRF 토큰을 붙입니다.
 *
 * 로그인 사용 가능한 Origin에서만 credentials를 포함합니다.
 * (그 밖의 Origin은 서버 허용 목록에 없어 credentials 요청이 CORS로 거부될 수 있음)
 */
export function withJaceAuth<T extends Pick<IHttpRequestOptions, 'method' | 'headers' | 'credentials'>>(options: T): T {
  if (!isLoginAvailable()) return options;

  const method = (options.method || 'GET').toUpperCase();
  const headers = { ...(options.headers || {}) };
  if (MUTATING_METHODS.has(method) && state.status === 'signed-in' && state.csrfToken) {
    headers['x-csrf-token'] = state.csrfToken;
  }
  return { ...options, credentials: 'include', headers };
}
