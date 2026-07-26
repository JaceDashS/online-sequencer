/**
 * API 설정 유틸리티
 * 
 * 모든 API 요청은 VITE_API_BASE_URL 환경변수를 통해 이루어집니다.
 * VITE_API_BASE_URL은 전체 API 베이스 URL을 포함합니다.
 */

type NodeProcessWithEnv = {
  env?: Record<string, string | undefined>;
};

function getEnvValue(key: 'VITE_API_BASE_URL' | 'VITE_BASE_URL' | 'VITE_API_PATH'): string | undefined {
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
