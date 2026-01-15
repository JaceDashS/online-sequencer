import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  saveFile: (options: { fileName: string; content: string | ArrayBuffer; isBinary?: boolean }) =>
    ipcRenderer.invoke('save-file', options),
  
  loadFile: (options: { filters?: Array<{ name: string; extensions: string[] }> }) =>
    ipcRenderer.invoke('load-file', options),
  
  saveFileHandle: (options: { filePath: string; content: string | ArrayBuffer; isBinary?: boolean }) =>
    ipcRenderer.invoke('save-file-handle', options),
});

