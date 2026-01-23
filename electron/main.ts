import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron';
import { existsSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { WebSocket } from 'ws';
import { request as httpRequest } from 'https';
import { request as httpRequestHttp } from 'http';
import { URL } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// .env 파일 로드 (실행 모드에 따라 .env.development / .env.production)
const envFileName = app.isPackaged ? '.env.production' : '.env.development';
const envCandidates = [
  // 빌드 앱 실행 위치(실행 파일과 같은 폴더)
  join(dirname(app.getPath('exe')), envFileName),
  // 빌드된 앱의 resources 디렉토리 상위
  join(app.getAppPath(), '..', envFileName),
  // 현재 작업 디렉토리
  join(process.cwd(), envFileName),
  // 개발 모드 기준
  join(__dirname, '..', envFileName),
];

const envPath = envCandidates.find((candidate) => existsSync(candidate));
if (envPath) {
  dotenv.config({ path: envPath });
  console.log('[main] Loaded env file:', envPath);
} else {
  console.warn(`[main] ${envFileName} not found in expected paths`);
}

function parseBooleanEnv(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.split('#')[0].trim().toLowerCase();
  return normalized === 'true';
}

let mainWindow: BrowserWindow | null = null;

// WebSocket 연결 관리
const wsConnections = new Map<string, WebSocket>();

function createWindow() {
  // 패키징 여부로 dev/prod를 판단해야 함.
  // (NODE_ENV는 사용자 시스템 환경변수에 의해 패키징 앱에서도 'development'로 들어올 수 있음)
  const isDev = !app.isPackaged;
  
  // 환경 변수로 개발자 도구 제어 (기본값: false)
  const enableDevTools = parseBooleanEnv(process.env.ENABLE_DEVTOOLS);

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1200, // 최소 창 너비
    minHeight: 800, // 최소 창 높이
    autoHideMenuBar: true, // 메뉴 바 자동 숨김
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: enableDevTools,
    },
  });

  // 메뉴 설정: DevTools 활성화 시에만 메뉴 추가 (키보드 단축키 사용 가능)
  if (enableDevTools) {
    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: 'View',
        submenu: [
          {
            label: 'Toggle Developer Tools',
            accelerator: process.platform === 'darwin' ? 'Alt+Cmd+I' : 'Ctrl+Shift+I',
            click: () => {
              const focusedWindow = BrowserWindow.getFocusedWindow();
              if (focusedWindow) {
                focusedWindow.webContents.toggleDevTools();
              }
            }
          }
        ]
      }
    ];
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  } else {
    // 메뉴 완전히 제거 (Alt 키로도 나타나지 않음)
    Menu.setApplicationMenu(null);
  }

  // 개발 모드에서는 Vite dev server 사용 (HMR 지원)
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    // 개발 모드에서도 환경 변수로 제어 가능
    if (enableDevTools) {
      mainWindow.webContents.openDevTools();
    }
  } else {
    // 프로덕션/빌드 모드에서는 빌드된 파일 사용 (네이티브)
    // electron-builder로 빌드하면 dist/가 app.asar/dist/로 패키징됨
    const appPath = app.getAppPath();
    const indexPath = join(appPath, 'dist', 'index.html');
    mainWindow.loadFile(indexPath);
    
    // 프로덕션 모드에서도 환경 변수로 개발자 도구 활성화 가능
    if (enableDevTools) {
      mainWindow.webContents.openDevTools();
    }
  }

  // 로드 실패/크래시 디버깅을 위한 최소 로그
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
     
    console.error('[main] did-fail-load', { errorCode, errorDescription, validatedURL });
  });
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
     
    console.error('[main] render-process-gone', details);
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 파일 저장 IPC 핸들러
ipcMain.handle('save-file', async (event, { fileName, content, isBinary = false }) => {
  const { filePath, canceled } = await dialog.showSaveDialog(mainWindow!, {
    defaultPath: fileName,
    filters: [
      { name: 'JSON Files', extensions: ['json'] },
      { name: 'MIDI Files', extensions: ['mid', 'midi'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });

  if (canceled) {
    return { canceled: true };
  }

  try {
    if (isBinary) {
      // ArrayBuffer를 Buffer로 변환
      const buffer = Buffer.from(content);
      await writeFile(filePath, buffer);
    } else {
      await writeFile(filePath, content, 'utf-8');
    }
    return { canceled: false, filePath };
  } catch (error) {
    throw error;
  }
});

// 파일 로드 IPC 핸들러
ipcMain.handle('load-file', async (event, { filters }) => {
  const { filePaths, canceled } = await dialog.showOpenDialog(mainWindow!, {
    filters: filters || [{ name: 'All Files', extensions: ['*'] }],
    properties: ['openFile'],
  });

  if (canceled || filePaths.length === 0) {
    return { canceled: true };
  }

  try {
    const filePath = filePaths[0];
    const content = await readFile(filePath);
    const fileName = filePath.split(/[/\\]/).pop() || '';
    const isBinary = fileName.endsWith('.mid') || fileName.endsWith('.midi');
    
    return {
      canceled: false,
      filePath,
      fileName,
      content: content.toString('base64'), // 바이너리 파일도 처리 가능하도록
      isBinary,
    };
  } catch (error) {
    throw error;
  }
});

// 파일 핸들 저장 (덮어쓰기용)
ipcMain.handle('save-file-handle', async (event, { filePath, content, isBinary = false }) => {
  try {
    if (isBinary) {
      const buffer = Buffer.from(content);
      await writeFile(filePath, buffer);
    } else {
      await writeFile(filePath, content, 'utf-8');
    }
    return { success: true };
  } catch (error) {
    throw error;
  }
});

// HTTP 요청 IPC 핸들러
ipcMain.handle('http-request', async (event, options: {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}) => {
  return new Promise((resolve, reject) => {
    try {
      const urlObj = new URL(options.url);
      const isHttps = urlObj.protocol === 'https:';
      const requestModule = isHttps ? httpRequest : httpRequestHttp;

      const req = requestModule({
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: options.method || 'GET',
        headers: options.headers || {},
      }, (res) => {
        let data = '';
        
        res.on('data', (chunk: Buffer) => {
          data += chunk.toString();
        });
        
        res.on('end', () => {
          const ok = (res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300;
          resolve({
            ok,
            status: res.statusCode || 0,
            body: data,
          });
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      if (options.body) {
        req.write(options.body);
      }

      req.end();
    } catch (error) {
      reject(error);
    }
  });
});

// WebSocket 연결 IPC 핸들러
ipcMain.handle('ws-connect', async (event, { connectionId, url }: { connectionId: string; url: string }) => {
  return new Promise((resolve, reject) => {
    try {
      const ws = new WebSocket(url);

      ws.on('open', () => {
        wsConnections.set(connectionId, ws);
        if (mainWindow) {
          mainWindow.webContents.send('ws-open', { connectionId });
        }
        resolve(undefined);
      });

      ws.on('message', (data: Buffer) => {
        if (mainWindow) {
          mainWindow.webContents.send('ws-message', {
            connectionId,
            data: data.toString(),
          });
        }
      });

      ws.on('error', (error) => {
        if (mainWindow) {
          mainWindow.webContents.send('ws-error', {
            connectionId,
            error: error.message || 'WebSocket error',
          });
        }
        wsConnections.delete(connectionId);
        reject(error);
      });

      ws.on('close', () => {
        if (mainWindow) {
          mainWindow.webContents.send('ws-close-event', { connectionId });
        }
        wsConnections.delete(connectionId);
      });

      // 타임아웃 처리 (10초)
      setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING) {
          ws.close();
          wsConnections.delete(connectionId);
          reject(new Error('WebSocket connection timeout'));
        }
      }, 10000);
    } catch (error) {
      reject(error);
    }
  });
});

// WebSocket 메시지 전송 IPC 핸들러
ipcMain.handle('ws-send', (event, { connectionId, data }: { connectionId: string; data: string }) => {
  const ws = wsConnections.get(connectionId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(data);
  } else {
    throw new Error(`WebSocket ${connectionId} is not connected`);
  }
});

// WebSocket 연결 종료 IPC 핸들러
ipcMain.handle('ws-close', (event, { connectionId }: { connectionId: string }) => {
  const ws = wsConnections.get(connectionId);
  if (ws) {
    ws.close();
    wsConnections.delete(connectionId);
  }
});
