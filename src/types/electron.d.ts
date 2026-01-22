/**
 * Electron API 타입 정의
 * Electron 환경에서 파일 시스템 접근 및 네트워크 통신을 위한 API
 */
export interface ElectronAPI {
  /**
   * 파일 저장 다이얼로그를 열고 파일을 저장
   * @param options 파일 저장 옵션
   * @returns 저장 결과 (취소 여부 및 파일 경로)
   */
  saveFile: (options: {
    fileName: string;
    content: string | ArrayBuffer;
    isBinary?: boolean;
  }) => Promise<{ canceled: boolean; filePath?: string }>;
  
  /**
   * 파일 열기 다이얼로그를 열고 파일을 로드
   * @param options 파일 로드 옵션
   * @returns 로드 결과 (취소 여부, 파일 경로, 파일명, 내용)
   */
  loadFile: (options: {
    filters?: Array<{ name: string; extensions: string[] }>;
  }) => Promise<{
    canceled: boolean;
    filePath?: string;
    fileName?: string;
    content?: string;
    isBinary?: boolean;
  }>;
  
  /**
   * 파일 핸들을 사용하여 파일을 저장 (덮어쓰기)
   * @param options 파일 저장 옵션
   * @returns 저장 성공 여부
   */
  saveFileHandle: (options: {
    filePath: string;
    content: string | ArrayBuffer;
    isBinary?: boolean;
  }) => Promise<{ success: boolean }>;
  
  /**
   * HTTP 요청 수행 (Main 프로세스를 통한 통신)
   * @param options HTTP 요청 옵션
   * @returns HTTP 응답
   */
  httpRequest: (options: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }) => Promise<{
    ok: boolean;
    status: number;
    json: () => Promise<unknown>;
    text: () => Promise<string>;
  }>;
  
  /**
   * WebSocket 연결 생성
   * @param url WebSocket 서버 URL
   * @returns 연결 ID (connectionId)
   */
  wsConnect: (url: string) => Promise<string>;
  
  /**
   * WebSocket 메시지 전송
   * @param connectionId 연결 ID
   * @param data 전송할 데이터
   */
  wsSend: (connectionId: string, data: string) => Promise<void>;
  
  /**
   * WebSocket 연결 종료
   * @param connectionId 연결 ID
   */
  wsClose: (connectionId: string) => Promise<void>;
  
  /**
   * WebSocket 이벤트 리스너 등록
   * @param connectionId 연결 ID
   * @param listeners 이벤트 리스너
   */
  wsSetListeners: (connectionId: string, listeners: {
    onopen?: () => void;
    onmessage?: (event: { data: string }) => void;
    onerror?: (error: Error) => void;
    onclose?: () => void;
  }) => void;
}

declare global {
  interface Window {
    /**
     * Electron API (Electron 환경에서만 사용 가능)
     */
    electronAPI?: ElectronAPI;
    
    /**
     * Electron 환경 여부 플래그
     */
    __ELECTRON__?: boolean;
  }
}

