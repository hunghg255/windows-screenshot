import { contextBridge, ipcRenderer } from 'electron';
import type { ScreenshotAPI } from '../shared/contracts';
const api: ScreenshotAPI = {
  settings: () => ipcRenderer.invoke('settings'),
  updateShortcuts: value => ipcRenderer.invoke('shortcuts', value),
  displays: () => ipcRenderer.invoke('displays'),
  onDisplaysChanged: callback => { const listener = () => callback(); ipcRenderer.on('displays-changed', listener); return () => ipcRenderer.removeListener('displays-changed', listener); },
  capture: request => ipcRenderer.invoke('capture', request),
  current: () => ipcRenderer.invoke('current'),
  crop: (id, rect) => ipcRenderer.invoke('crop', id, rect),
  cancel: id => ipcRenderer.invoke('cancel', id),
  output: (id, action, png) => ipcRenderer.invoke('output', id, action, png),
};
contextBridge.exposeInMainWorld('screenshot', Object.freeze(api));
