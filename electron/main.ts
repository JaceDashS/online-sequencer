import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 800,
    minWidth: 1400, // 최소 창 너비
    minHeight: 800, // 최소 창 높이
    autoHideMenuBar: true, // 메뉴 바 자동 숨김
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 패키징 여부로 dev/prod를 판단해야 함.
  // (NODE_ENV는 사용자 시스템 환경변수에 의해 패키징 앱에서도 'development'로 들어올 수 있음)
  const isDev = !app.isPackaged;

  // 개발 모드에서는 Vite dev server 사용 (HMR 지원)
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // 프로덕션/빌드 모드에서는 빌드된 파일 사용 (네이티브)
    // electron-builder로 빌드하면 dist/가 app.asar/dist/로 패키징됨
    const appPath = app.getAppPath();
    const indexPath = join(appPath, 'dist', 'index.html');
    mainWindow.loadFile(indexPath);
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

