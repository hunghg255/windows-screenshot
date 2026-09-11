import { contextBridge, ipcRenderer } from 'electron';
import type { ScreenshotAPI } from '../shared/contracts';
const api: ScreenshotAPI = {
  importImage: id => ipcRenderer.invoke('import-image', id),
  settings: () => ipcRenderer.invoke('settings'),
  updateShortcuts: value => ipcRenderer.invoke('shortcuts', value),
  selection: (id, phase) => ipcRenderer.invoke('selection', id, phase),
  onSelection: callback => { const listener = (_event: Electron.IpcRendererEvent, rect: import('../shared/contracts').Rect | null) => callback(rect); ipcRenderer.on('selection-changed', listener); return () => ipcRenderer.removeListener('selection-changed', listener); },
  capture: request => ipcRenderer.invoke('capture', request),
  current: () => ipcRenderer.invoke('current'),
  crop: (id, rect) => ipcRenderer.invoke('crop', id, rect),
  cancel: id => ipcRenderer.invoke('cancel', id),
  output: (id, action, png) => ipcRenderer.invoke('output', id, action, png),
};
contextBridge.exposeInMainWorld('screenshot', Object.freeze(api));
