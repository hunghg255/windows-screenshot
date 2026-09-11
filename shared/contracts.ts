export type CaptureMode = 'full' | 'region';
export type CaptureRequest = { mode: CaptureMode };
export type Point = { x: number; y: number };
export type Rect = Point & { width: number; height: number };
export type Shortcuts = { full: string; region: string };
export type Settings = { shortcuts: Shortcuts; lastDirectory?: string };
export type CaptureData = { id: string; image: string; width: number; height: number; mode: CaptureMode; overlayBounds?: Rect };
export type Result<T = undefined> = { ok: true; value: T } | { ok: false; error: string };
export interface ScreenshotAPI {
  importImage(id: string): Promise<Result<import('./image-import').ImportedImage | null>>;
  settings(): Promise<Result<{ settings: Settings; warning: string }>>;
  updateShortcuts(value: Shortcuts): Promise<Result<Settings>>;
  selection(id: string, phase: 'start' | 'end' | 'reset'): Promise<Result>;
  onSelection(callback: (rect: Rect | null) => void): () => void;
  capture(request: CaptureRequest): Promise<Result>;
  current(): Promise<Result<CaptureData | null>>;
  crop(id: string, rect: Rect): Promise<Result>;
  cancel(id: string): Promise<Result>;
  output(id: string, action: 'copy' | 'save', png: string): Promise<Result<'copied' | 'saved' | 'cancelled'>>;
}
