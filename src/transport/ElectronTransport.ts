/**
 * ElectronTransport
 * 
 * Electron 환경에서 사용하는 Transport 구현입니다.
 * Main 프로세스를 통한 네트워크 통신을 IPC로 수행합니다.
 */

import type { ITransport, IHttpRequestOptions, IHttpResponse, IWebSocket } from './types';
import { WebSocketReadyState } from './types';

/**
 * Electron용 Transport 구현
 */
export class ElectronTransport implements ITransport {
  /**
   * Electron API가 사용 가능한지 확인
   */
  private checkElectronAPI(): void {
    if (typeof window === 'undefined' || !window.electronAPI) {
      throw new Error('Electron API is not available. This transport can only be used in Electron environment.');
    }
  }

  /**
   * HTTP 요청 수행
   * 
   * @param options 요청 옵션
   * @returns HTTP 응답
   */
  async request(options: IHttpRequestOptions): Promise<IHttpResponse> {
    this.checkElectronAPI();

    const api = window.electronAPI!;
    const response = await api.httpRequest({
      url: options.url,
      method: options.method,
      headers: options.headers,
      body: options.body,
    });

    return {
      ok: response.ok,
      status: response.status,
      json: () => response.json(),
      text: () => response.text(),
    };
  }

  /**
   * WebSocket 연결 생성
   * 
   * @param url WebSocket 서버 URL
   * @returns WebSocket 인스턴스
   */
  async connectWebSocket(url: string): Promise<IWebSocket> {
    this.checkElectronAPI();

    const api = window.electronAPI!;

    // Main 프로세스를 통해 WebSocket 연결
    const connectionId = await api.wsConnect(url);

    // readyState를 관리하기 위한 내부 변수
    let currentReadyState: number = WebSocketReadyState.CONNECTING;
    let isOpen = false;
    let openHandlerCalled = false;
    let onopenHandler: (() => void) | null = null;
    let onmessageHandler: ((event: { data: string }) => void) | null = null;
    let onerrorHandler: ((error: Error) => void) | null = null;
    let oncloseHandler: (() => void) | null = null;

    const notifyOpen = () => {
      if (isOpen) {
        return;
      }
      isOpen = true;
      currentReadyState = WebSocketReadyState.OPEN;
      if (onopenHandler && !openHandlerCalled) {
        openHandlerCalled = true;
        onopenHandler();
      }
    };

    // IWebSocket 인터페이스로 래핑
    const wrapped = {
      send: (data: string) => {
        api.wsSend(connectionId, data);
      },
      close: () => {
        api.wsClose(connectionId);
        currentReadyState = WebSocketReadyState.CLOSED;
      },
      get readyState(): number {
        return currentReadyState;
      },
      get onopen(): (() => void) | null {
        return onopenHandler;
      },
      set onopen(handler: (() => void) | null) {
        onopenHandler = handler;
        if (isOpen && handler && !openHandlerCalled) {
          openHandlerCalled = true;
          queueMicrotask(() => {
            if (onopenHandler === handler) {
              handler();
            }
          });
        }
      },
      get onmessage(): ((event: { data: string }) => void) | null {
        return onmessageHandler;
      },
      set onmessage(handler: ((event: { data: string }) => void) | null) {
        onmessageHandler = handler;
      },
      get onerror(): ((error: Error) => void) | null {
        return onerrorHandler;
      },
      set onerror(handler: ((error: Error) => void) | null) {
        onerrorHandler = handler;
      },
      get onclose(): (() => void) | null {
        return oncloseHandler;
      },
      set onclose(handler: (() => void) | null) {
        oncloseHandler = handler;
      },
    } as IWebSocket;

    // 이벤트 리스너 등록
    const listeners = {
      onopen: () => {
        notifyOpen();
      },
      onmessage: (event: { data: string }) => {
        if (onmessageHandler) {
          onmessageHandler(event);
        }
      },
      onerror: (error: Error) => {
        currentReadyState = WebSocketReadyState.CLOSED;
        if (onerrorHandler) {
          onerrorHandler(error);
        }
      },
      onclose: () => {
        currentReadyState = WebSocketReadyState.CLOSED;
        if (oncloseHandler) {
          oncloseHandler();
        }
      },
    };

    // Preload에서 이벤트 리스너 등록
    api.wsSetListeners(connectionId, listeners);

    // wsConnect는 이미 open 이후 resolve되므로 즉시 open 처리
    notifyOpen();

    return wrapped;
  }
}

