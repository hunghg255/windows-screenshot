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
const subscribe = (channel: string, callback: (value: any) => void) => {
  const listener = (_event: Electron.IpcRendererEvent, value: unknown) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};
const recording: import('../shared/recording-contracts').RecordingAPI = {
  open: () => ipcRenderer.invoke('recording:open'),
  sources: () => ipcRenderer.invoke('sources:list'),
  getState: () => ipcRenderer.invoke('recording:get-state'),
  settings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: value => ipcRenderer.invoke('settings:set', value),
  chooseDirectory: () => ipcRenderer.invoke('recording:choose-directory'),
  disk: () => ipcRenderer.invoke('disk:check'),
  permissions: () => ipcRenderer.invoke('permissions:check'),
  selectRegion: id => ipcRenderer.invoke('region:open', id),
  regionSelected: rect => ipcRenderer.invoke('region:selected', rect),
  start: config => ipcRenderer.invoke('recording:start', config),
  pause: () => ipcRenderer.invoke('recording:pause'),
  resume: () => ipcRenderer.invoke('recording:resume'),
  stop: () => ipcRenderer.invoke('recording:stop'),
  mute: muted => ipcRenderer.invoke('recording:mute', muted),
  reset: () => ipcRenderer.invoke('recording:reset'),
  openFile: id => ipcRenderer.invoke('shell:open-file', id),
  openFolder: id => ipcRenderer.invoke('shell:open-folder', id),
  recoveries: () => ipcRenderer.invoke('recording:recovery-list'),
  recover: id => ipcRenderer.invoke('recording:recover', id),
  onState: cb => subscribe('recording:state', cb),
  onFinished: cb => subscribe('recording:finished', cb),
  onSourcesChanged: cb => subscribe('sources:changed', cb),
  onCommand: cb => subscribe('recording:command', cb),
  ready: () => ipcRenderer.invoke('recording:ready'),
  ack: ack => ipcRenderer.invoke('recording:ack', ack),
  chunk: (id, sequence, bytes) => ipcRenderer.invoke('recording:chunk', id, sequence, bytes),
  end: (id, lastSequence) => ipcRenderer.invoke('recording:end', id, lastSequence),
  error: (id, message) => ipcRenderer.invoke('recording:error', id, message),
  warning: (id, message) => ipcRenderer.invoke('recording:warning', id, message),
  reportFrames: (id, frames, maxGapMs) => ipcRenderer.invoke('recording:frames', id, frames, maxGapMs),
};
contextBridge.exposeInMainWorld('recording', Object.freeze(recording));
