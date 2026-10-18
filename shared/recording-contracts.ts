import type { Rect, Result } from './contracts';
export type RecordingState = 'idle' | 'selecting-region' | 'ready' | 'countdown' | 'recording' | 'paused' | 'stopping' | 'finalizing' | 'done' | 'error';
export type RecordingSource = { id: string; displayId: number; name: string; thumbnail: string; bounds: Rect; scaleFactor: number };
export type RecordingConfig = { sourceId: string; mode: 'full' | 'region'; region: Rect | null; mic: boolean; micId: string; countdown: boolean };
export type RecordingSettings = RecordingConfig & { directory: string; stopShortcut: string; pauseShortcut: string };
export const recordingDefaults: RecordingSettings = { sourceId: '', mode: 'full', region: null, mic: false, micId: '', countdown: true, directory: '', stopShortcut: 'Ctrl+Shift+2', pauseShortcut: 'Ctrl+Shift+3' };
export type RecordingResult = { id: string; path: string; bytes: number; durationMs: number; recovered?: boolean; videoFrames?: number; maxFrameGapMs?: number };
export type RecordingSnapshot = { id: string; revision: number; state: RecordingState; elapsedMs: number; bytes: number; muted: boolean; countdown: number; error: string; warning: string; region: Rect | null; result: RecordingResult | null; inputFrames?:number; maxInputGapMs?:number };
export type RecorderCommand = { id: string; requestId: string; action: 'start' | 'pause' | 'resume' | 'stop' | 'mute'; config?: RecordingConfig; source?: RecordingSource; muted?: boolean };
export type RecorderAck = { id: string; requestId: string; error?: string };
export type RecoveryItem = { id: string; name: string; bytes: number };
export const CHUNK_LIMIT = 8 * 1024 * 1024;
export const QUEUE_LIMIT = 32 * 1024 * 1024;
export interface RecordingAPI {
  open(): Promise<Result>;
  sources(): Promise<Result<RecordingSource[]>>;
  getState(): Promise<Result<RecordingSnapshot>>;
  settings(): Promise<Result<RecordingSettings>>;
  saveSettings(value: RecordingSettings): Promise<Result>;
  chooseDirectory(): Promise<Result<string | null>>;
  disk(): Promise<Result<number>>;
  permissions(): Promise<Result<{ screen: string; microphone: string }>>;
  selectRegion(sourceId: string): Promise<Result>;
  regionSelected(region: Rect | null): Promise<Result>;
  start(config: RecordingConfig): Promise<Result>;
  pause(): Promise<Result>;
  resume(): Promise<Result>;
  stop(): Promise<Result>;
  mute(muted: boolean): Promise<Result>;
  reset(): Promise<Result>;
  openFile(id: string): Promise<Result>;
  openFolder(id: string): Promise<Result>;
  recoveries(): Promise<Result<RecoveryItem[]>>;
  recover(id: string): Promise<Result>;
  onState(callback: (value: RecordingSnapshot) => void): () => void;
  onFinished(callback: (value: RecordingResult) => void): () => void;
  onSourcesChanged(callback: () => void): () => void;
  onCommand(callback: (value: RecorderCommand) => void): () => void;
  ready(): Promise<Result>;
  ack(value: RecorderAck): Promise<Result>;
  chunk(id: string, sequence: number, bytes: ArrayBuffer): Promise<Result>;
  end(id: string, lastSequence: number): Promise<Result>;
  error(id: string, message: string): Promise<Result>;
  warning(id: string, message: string): Promise<Result>;
  reportFrames(id: string, frames: number, maxGapMs: number): Promise<Result>;
}
export function validRecordingConfig(v: unknown): v is RecordingConfig {
  if (!v || typeof v !== 'object') return false;
  const c = v as RecordingConfig;
  return typeof c.sourceId === 'string' && c.sourceId.length < 200 && ['full', 'region'].includes(c.mode) &&
    typeof c.mic === 'boolean' && typeof c.micId === 'string' && c.micId.length < 512 && typeof c.countdown === 'boolean' &&
    (c.region === null || validRegion(c.region));
}
export function validRegion(v: unknown): v is Rect {
  if (!v || typeof v !== 'object') return false;
  const r = v as Rect;
  return [r.x,r.y,r.width,r.height].every(Number.isFinite) && r.x >= 0 && r.y >= 0 && r.width > 0 && r.height > 0;
}
