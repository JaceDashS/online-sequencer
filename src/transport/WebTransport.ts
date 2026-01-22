/**
 * WebTransport
 * 
 * 브라우저 환경에서 사용하는 Transport 구현입니다.
 * fetch API와 브라우저 WebSocket을 사용합니다.
 */

import type { ITransport, IHttpRequestOptions, IHttpResponse, IWebSocket } from './types';

/**
 * 브라우저용 Transport 구현
 */
export class WebTransport implements ITransport {
  /**
   * HTTP 요청 수행
   * 
   * @param options 요청 옵션
   * @returns HTTP 응답
   */
  async request(options: IHttpRequestOptions): Promise<IHttpResponse> {
    const response = await fetch(options.url, {
      method: options.method || 'GET',
      headers: options.headers,
      body: options.body,
      signal: options.signal,
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
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);

      // 타임아웃 처리 (10초)
      const timeout = setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING) {
          ws.close();
          reject(new Error('WebSocket connection timeout'));
        }
      }, 10000);

      // 연결 성공 시 resolve
      ws.onopen = () => {
        clearTimeout(timeout);
        resolve(this.wrapWebSocket(ws));
      };

      // 연결 실패 시 reject
      ws.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('WebSocket connection failed'));
      };
    });
  }

  /**
   * 브라우저 WebSocket을 IWebSocket 인터페이스로 래핑
   * 
   * @param ws 브라우저 WebSocket 인스턴스
   * @returns IWebSocket 인터페이스
   */
  private wrapWebSocket(ws: WebSocket): IWebSocket {
    const wrapped: IWebSocket = {
      send: (data: string) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(data);
        } else {
          throw new Error('WebSocket is not open');
        }
      },
      close: () => {
        ws.close();
      },
      get readyState(): number {
        return ws.readyState;
      },
      onopen: null,
      onmessage: null,
      onerror: null,
      onclose: null,
    };

    // 브라우저 WebSocket 이벤트를 IWebSocket 인터페이스에 맞게 변환
    ws.onopen = () => {
      if (wrapped.onopen) {
        wrapped.onopen();
      }
    };

    ws.onmessage = (event: MessageEvent) => {
      if (wrapped.onmessage) {
        wrapped.onmessage({ data: event.data as string });
      }
    };

    ws.onerror = () => {
      if (wrapped.onerror) {
        wrapped.onerror(new Error('WebSocket error'));
      }
    };

    ws.onclose = () => {
      if (wrapped.onclose) {
        wrapped.onclose();
      }
    };

    return wrapped;
  }
}

