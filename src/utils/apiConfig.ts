/**
 * API 설정 유틸리티
 * 
 * 모든 API 요청은 VITE_API_BASE_URL 환경변수를 통해 이루어집니다.
 * VITE_API_BASE_URL은 전체 API 베이스 URL을 포함합니다.
 */

type NodeProcessWithEnv = {
  env?: Record<string, string | undefined>;
};

type EnvKey =
  | 'VITE_API_BASE_URL'
  | 'VITE_BASE_URL'
  | 'VITE_API_PATH'
  | 'VITE_API_ORIGIN'
  | 'VITE_SITE_URL'
  | 'VITE_LOGIN_HOSTS';

function getEnvValue(key: EnvKey): string | undefined {
  const viteEnv = import.meta.env as unknown as Record<string, string | undefined> | undefined;
  const viteValue = viteEnv?.[key];
  if (viteValue) {
    return viteValue;
  }

  const nodeProcess = (globalThis as typeof globalThis & { process?: NodeProcessWithEnv }).process;
  return nodeProcess?.env?.[key];
}

/**
 * API 베이스 URL을 가져옵니다.
 * 
 * @returns API 베이스 URL
 * @throws 환경변수가 설정되지 않은 경우 에러를 던집니다
 */
export function getApiBaseUrl(): string {
  const apiBaseUrl = getEnvValue('VITE_API_BASE_URL');
  const baseUrl = getEnvValue('VITE_BASE_URL');
  const apiPath = getEnvValue('VITE_API_PATH');

  if (apiBaseUrl) {
    return apiBaseUrl.replace(/\/$/, '');
  }

  if (!baseUrl || !apiPath) {
    throw new Error(
      'API base URL is not configured. ' +
      'Set VITE_API_BASE_URL or set both VITE_BASE_URL and VITE_API_PATH.'
    );
  }

  const normalizedBase = baseUrl.replace(/\/$/, '');
  const normalizedPath = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
  return `${normalizedBase}${normalizedPath}`.replace(/\/$/, '');
}

/**
 * API 엔드포인트 URL을 생성합니다.
 * 
 * @param endpoint - API 엔드포인트 경로 (예: '/rooms', '/rooms/1234')
 * @returns 전체 API URL
 * 
 * @example
 * ```ts
 * const url = buildApiUrl('/rooms');
 * const url = buildApiUrl('/rooms/1234');
 * ```
 */
export function buildApiUrl(endpoint: string): string {
  const baseUrl = getApiBaseUrl();
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${baseUrl}${normalizedEndpoint}`;
}

/**
 * WebSocket URL을 생성합니다.
 * API 베이스 URL을 기반으로 WebSocket URL을 생성합니다.
 * 
 * @param path - WebSocket 경로 (예: '/signaling')
 * @param queryParams - 쿼리 파라미터 객체 (선택사항)
 * @returns WebSocket URL
 * 
 * @example
 * ```ts
 * const wsUrl = buildWebSocketUrl('/signaling', { clientId: '123' });
 * ```
 */
export function buildWebSocketUrl(path: string, queryParams?: Record<string, string>): string {
  const apiBaseUrl = getApiBaseUrl();
  
  // HTTP/HTTPS를 WS/WSS로 변환
  const wsBaseUrl = apiBaseUrl
    .replace(/^http:\/\//, 'ws://')
    .replace(/^https:\/\//, 'wss://');
  
  // 경로 정규화
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  
  // 쿼리 파라미터 추가
  let url = `${wsBaseUrl}${normalizedPath}`;
  if (queryParams) {
    const params = new URLSearchParams(queryParams);
    const queryString = params.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }
  
  return url;
}

/** jace-s에 등록된 Online Sequencer 앱 ID */
export const JACE_S_APP_ID = 41;

/** jace-s API 기본 주소 (health, notices, auth) */
export const DEFAULT_API_ORIGIN = 'https://api.jace-s.com';

/** jace-s 화면(로그인 페이지) 기본 주소 */
export const DEFAULT_SITE_URL = 'https://jace-s.com';

/** 로그인 쿠키를 사용할 수 있는(서버 허용 Origin) 호스트 기본값 */
export const DEFAULT_LOGIN_HOSTS = ['online-sequencer.jace-s.com'];

function getOrigin(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * jace-s API origin을 가져옵니다.
 *
 * 우선순위: VITE_API_ORIGIN → API 베이스 URL의 origin → DEFAULT_API_ORIGIN
 */
export function getApiOrigin(): string {
  const explicit = getOrigin(getEnvValue('VITE_API_ORIGIN'));
  if (explicit) return explicit;

  try {
    const fromBase = getOrigin(getApiBaseUrl());
    if (fromBase) return fromBase;
  } catch {
    // API 베이스 URL 미설정: 기본값 사용
  }
  return DEFAULT_API_ORIGIN;
}

/**
 * jace-s 화면 주소(로그인 페이지 등)를 가져옵니다.
 */
export function getSiteUrl(): string {
  return getOrigin(getEnvValue('VITE_SITE_URL')) ?? DEFAULT_SITE_URL;
}

/**
 * 로그인 UI를 보여줄 호스트 목록을 가져옵니다. (VITE_LOGIN_HOSTS: 쉼표 구분)
 */
export function getLoginHosts(): string[] {
  const raw = getEnvValue('VITE_LOGIN_HOSTS');
  if (!raw) return DEFAULT_LOGIN_HOSTS;
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
