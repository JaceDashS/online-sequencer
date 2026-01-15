/**
 * Electron API 타입 정의
 * Electron 환경에서 파일 시스템 접근을 위한 API
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
}

declare global {
  interface Window {
    /**
     * Electron API (Electron 환경에서만 사용 가능)
     */
    electronAPI?: ElectronAPI;
  }
}

