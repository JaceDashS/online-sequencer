import { contextBridge, ipcRenderer } from 'electron';

// WebSocket 연결 관리 (connectionId -> 이벤트 리스너)
const wsEventListeners = new Map<string, {
  onopen?: () => void;
  onmessage?: (event: { data: string }) => void;
  onerror?: (error: Error) => void;
  onclose?: () => void;
}>();

// IPC 이벤트 리스너 등록
ipcRenderer.on('ws-open', (event, { connectionId }: { connectionId: string }) => {
  const listeners = wsEventListeners.get(connectionId);
  if (listeners?.onopen) {
    listeners.onopen();
  }
});

ipcRenderer.on('ws-message', (event, { connectionId, data }: { connectionId: string; data: string }) => {
  const listeners = wsEventListeners.get(connectionId);
  if (listeners?.onmessage) {
    listeners.onmessage({ data });
  }
});

ipcRenderer.on('ws-error', (event, { connectionId, error }: { connectionId: string; error: string }) => {
  const listeners = wsEventListeners.get(connectionId);
  if (listeners?.onerror) {
    listeners.onerror(new Error(error));
  }
});

ipcRenderer.on('ws-close-event', (event, { connectionId }: { connectionId: string }) => {
  const listeners = wsEventListeners.get(connectionId);
  if (listeners?.onclose) {
    listeners.onclose();
  }
  wsEventListeners.delete(connectionId);
});

contextBridge.exposeInMainWorld('electronAPI', {
  saveFile: (options: { fileName: string; content: string | ArrayBuffer; isBinary?: boolean }) =>
    ipcRenderer.invoke('save-file', options),
  
  loadFile: (options: { filters?: Array<{ name: string; extensions: string[] }> }) =>
    ipcRenderer.invoke('load-file', options),
  
  saveFileHandle: (options: { filePath: string; content: string | ArrayBuffer; isBinary?: boolean }) =>
    ipcRenderer.invoke('save-file-handle', options),
  
  // HTTP 요청
  httpRequest: async (options: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }) => {
    const response = await ipcRenderer.invoke('http-request', options);
    const body = typeof response?.body === 'string' ? response.body : '';
    return {
      ok: !!response?.ok,
      status: typeof response?.status === 'number' ? response.status : 0,
      json: async () => {
        try {
          return JSON.parse(body);
        } catch (error) {
          throw error instanceof Error ? error : new Error('Invalid JSON response');
        }
      },
      text: async () => body,
    };
  },
  
  // WebSocket 연결
  wsConnect: async (url: string): Promise<string> => {
    const connectionId = `ws-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    await ipcRenderer.invoke('ws-connect', { connectionId, url });
    return connectionId;
  },
  
  // WebSocket 메시지 전송
  wsSend: (connectionId: string, data: string) => {
    ipcRenderer.invoke('ws-send', { connectionId, data });
  },
  
  // WebSocket 연결 종료
  wsClose: (connectionId: string) => {
    ipcRenderer.invoke('ws-close', { connectionId });
    wsEventListeners.delete(connectionId);
  },
  
  // WebSocket 이벤트 리스너 등록
  wsSetListeners: (connectionId: string, listeners: {
    onopen?: () => void;
    onmessage?: (event: { data: string }) => void;
    onerror?: (error: Error) => void;
    onclose?: () => void;
  }) => {
    wsEventListeners.set(connectionId, listeners);
  },
});

// Electron 플래그 추가
contextBridge.exposeInMainWorld('__ELECTRON__', true);

