/**
 * jace-s API 설정
 *
 * 계약: jace-s 저장소 docs/api/apps/online-sequencer/ (10-client-contract, 20-health, 30-app-contract)
 *
 * - API:        https://api.jace-s.com (경로에 /api를 붙이지 않는다)
 * - 협업 API:   {API_URL}/online-sequencer/...
 * - WebSocket:  wss://api.jace-s.com/online-sequencer/signaling?clientId=...
 * - 로그인 화면: https://jace-s.com/login (SITE_URL)
 *
 * 주소는 이 파일의 설정값으로만 만든다. 코드 곳곳에 주소를 직접 쓰지 않는다.
 */

type EnvKey = 'VITE_API_URL' | 'VITE_SITE_URL' | 'VITE_NOTICE_APP_ID' | 'VITE_LOGIN_HOSTS';

type NodeProcessWithEnv = {
  env?: Record<string, string | undefined>;
};

function getEnvValue(key: EnvKey): string | undefined {
  const viteEnv = import.meta.env as unknown as Record<string, string | undefined> | undefined;
  const viteValue = viteEnv?.[key];
  if (viteValue) {
    return viteValue;
  }

  const nodeProcess = (globalThis as typeof globalThis & { process?: NodeProcessWithEnv }).process;
  return nodeProcess?.env?.[key];
}

/** jace-s API 기본 주소 */
export const DEFAULT_API_URL = 'https://api.jace-s.com';

/** jace-s 화면(로그인·계정) 기본 주소 */
export const DEFAULT_SITE_URL = 'https://jace-s.com';

/** jace-s에 등록된 Online Sequencer 앱 ID (공지 조회용) */
export const DEFAULT_NOTICE_APP_ID = 41;


/** 협업(시그널링) API 경로 */
const COLLABORATION_PATH = '/online-sequencer';

function getOrigin(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * jace-s API 주소 (VITE_API_URL, 기본 https://api.jace-s.com). origin만 사용한다.
 */
export function getApiUrl(): string {
  return getOrigin(getEnvValue('VITE_API_URL')) ?? DEFAULT_API_URL;
}

/**
 * jace-s 화면 주소 (VITE_SITE_URL, 기본 https://jace-s.com)
 */
export function getSiteUrl(): string {
  return getOrigin(getEnvValue('VITE_SITE_URL')) ?? DEFAULT_SITE_URL;
}

/**
 * 공지 조회용 앱 ID (VITE_NOTICE_APP_ID, 기본 41)
 */
export function getNoticeAppId(): number {
  const raw = getEnvValue('VITE_NOTICE_APP_ID');
  const parsed = raw ? Number(raw) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_NOTICE_APP_ID;
}

/**
 * 협업 API 엔드포인트 URL을 생성합니다.
 *
 * @param endpoint - 협업 경로 기준 엔드포인트 (예: '/rooms', '/rooms/1234')
 * @returns {API_URL}/online-sequencer{endpoint}
 */
export function buildApiUrl(endpoint: string): string {
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${getApiUrl()}${COLLABORATION_PATH}${normalizedEndpoint}`;
}

/**
 * 협업 WebSocket URL을 생성합니다.
 *
 * @param path - 협업 경로 기준 WebSocket 경로 (예: '/signaling')
 * @param queryParams - 쿼리 파라미터 (선택)
 * @returns wss://{API host}/online-sequencer{path}?...
 */
export function buildWebSocketUrl(path: string, queryParams?: Record<string, string>): string {
  const wsBaseUrl = getApiUrl()
    .replace(/^http:\/\//, 'ws://')
    .replace(/^https:\/\//, 'wss://');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  let url = `${wsBaseUrl}${COLLABORATION_PATH}${normalizedPath}`;
  if (queryParams) {
    const queryString = new URLSearchParams(queryParams).toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }
  return url;
}

/**
 * 로그인 UI를 보여줄 호스트 목록 (VITE_LOGIN_HOSTS: 쉼표 구분)
 *
 * 코드 기본값은 없다. jace-s 서버가 credentials를 허용하는 Origin의 호스트만 넣는다
 * (운영: online-sequencer.jace-s.com). 설정하지 않으면 어느 주소에서도 로그인 UI를 숨긴다.
 */
export function getLoginHosts(): string[] {
  const raw = getEnvValue('VITE_LOGIN_HOSTS');
  if (!raw) return [];
  return raw
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * 현재 페이지에서 jace-s 로그인을 쓸 수 있는지 확인합니다.
 *
 * 로그인 쿠키는 jace-s API에만 있고, 서버는 허용 Origin에만 credentials를 허용합니다.
 * 따라서 허용 호스트(online-sequencer.jace-s.com)의 브라우저에서만 로그인을 사용합니다.
 * vercel.app, localhost, Electron(file://)에서는 로그인 UI를 숨깁니다.
 */
export function isLoginAvailable(location: Pick<Location, 'protocol' | 'hostname'> | undefined =
  typeof window !== 'undefined' ? window.location : undefined): boolean {
  if (!location) return false;
  if (location.protocol !== 'https:' && location.protocol !== 'http:') return false;
  if (typeof window !== 'undefined' && window.__ELECTRON__) return false;
  return getLoginHosts().includes(location.hostname.toLowerCase());
}

/**
 * Vite 개발 서버(npm run dev) 빌드인지 확인합니다. 테스트(Node)에서는 false입니다.
 */
export function isDevBuild(): boolean {
  const viteEnv = import.meta.env as unknown as { DEV?: boolean } | undefined;
  return viteEnv?.DEV === true;
}
