/**
 * Transport 계층 타입 정의
 * 
 * Web과 Electron에서 네트워크 통신을 추상화하기 위한 인터페이스입니다.
 */

/**
 * HTTP 요청 옵션
 */
export interface IHttpRequestOptions {
  /** 요청 URL */
  url: string;
  /** HTTP 메서드 (기본값: 'GET') */
  method?: string;
  /** 요청 헤더 */
  headers?: Record<string, string>;
  /** 요청 본문 */
  body?: string;
  /** AbortSignal (요청 취소용) */
  signal?: AbortSignal;
}

/**
 * HTTP 응답
 */
export interface IHttpResponse {
  /** 요청 성공 여부 (200-299 범위) */
  ok: boolean;
  /** HTTP 상태 코드 */
  status: number;
  /** JSON 응답 파싱 */
  json(): Promise<unknown>;
  /** 텍스트 응답 */
  text(): Promise<string>;
}

/**
 * WebSocket 이벤트 핸들러
 */
export interface IWebSocketEventHandlers {
  /** 연결 성공 시 호출 */
  onopen?: () => void;
  /** 메시지 수신 시 호출 */
  onmessage?: (event: { data: string }) => void;
  /** 에러 발생 시 호출 */
  onerror?: (error: Error) => void;
  /** 연결 종료 시 호출 */
  onclose?: () => void;
}

/**
 * WebSocket 인터페이스
 * 
 * 브라우저 WebSocket과 호환되는 인터페이스입니다.
 */
export interface IWebSocket {
  /** 메시지 전송 */
  send(data: string): void;
  /** 연결 종료 */
  close(): void;
  
  /** 연결 상태 */
  readonly readyState: number;
  
  /** 이벤트 핸들러 */
  onopen: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onerror: ((error: Error) => void) | null;
  onclose: (() => void) | null;
}

/**
 * WebSocket 연결 상태 상수
 */
export const WebSocketReadyState = {
  /** 연결 중 */
  CONNECTING: 0,
  /** 연결됨 */
  OPEN: 1,
  /** 연결 종료 중 */
  CLOSING: 2,
  /** 연결 종료됨 */
  CLOSED: 3,
} as const;

/**
 * Transport 인터페이스
 * 
 * 플랫폼별 네트워크 통신 구현을 추상화합니다.
 * - Web: 브라우저 fetch/WebSocket 사용
 * - Electron: Main 프로세스를 통한 통신
 */
export interface ITransport {
  /**
   * HTTP 요청 수행
   * 
   * @param options 요청 옵션
   * @returns HTTP 응답
   */
  request(options: IHttpRequestOptions): Promise<IHttpResponse>;

  /**
   * WebSocket 연결 생성
   * 
   * @param url WebSocket 서버 URL
   * @returns WebSocket 인스턴스
   */
  connectWebSocket(url: string): Promise<IWebSocket>;
}

