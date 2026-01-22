/**
 * Transport 팩토리
 * 
 * 플랫폼을 감지하고 적절한 Transport 구현을 반환합니다.
 * - Web: WebTransport 사용
 * - Electron: ElectronTransport 사용
 */

import type { ITransport } from './types';
import { WebTransport } from './WebTransport';
import { ElectronTransport } from './ElectronTransport';

let transportInstance: ITransport | null = null;

/**
 * 플랫폼을 감지하고 적절한 Transport 인스턴스를 반환합니다.
 * 
 * @returns Transport 인스턴스
 */
export function getTransport(): ITransport {
  // 싱글톤 패턴: 이미 생성된 인스턴스가 있으면 재사용
  if (transportInstance) {
    return transportInstance;
  }

  // Electron 환경 감지
  if (typeof window !== 'undefined' && window.__ELECTRON__ && window.electronAPI) {
    transportInstance = new ElectronTransport();
  } else {
    // Web 브라우저 환경
    transportInstance = new WebTransport();
  }

  return transportInstance;
}

/**
 * Transport 인스턴스를 설정합니다.
 * 주로 테스트 목적으로 사용됩니다.
 * 
 * @param transport 설정할 Transport 인스턴스
 */
export function setTransport(transport: ITransport): void {
  transportInstance = transport;
}

/**
 * Transport 인스턴스를 초기화합니다.
 * 주로 테스트 목적으로 사용됩니다.
 */
export function resetTransport(): void {
  transportInstance = null;
}

// 타입 재export
export type { ITransport, IHttpRequestOptions, IHttpResponse, IWebSocket } from './types';
export { WebSocketReadyState } from './types';
export { WebTransport } from './WebTransport';
export { ElectronTransport } from './ElectronTransport';

