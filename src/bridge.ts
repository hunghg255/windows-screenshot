import type { Result, ScreenshotAPI } from '../shared/contracts';
import { inspectImage } from '../shared/image-import';
import { Screenshot, onSelectionChanged } from './myzig';

// Zig errors reach the page as "Screenshot.method: ErrorName".
const messages: Record<string, string> = {
  Unauthorized: 'Unauthorized request.',
  SessionEnded: 'This capture session has ended.',
  InvalidRegion: 'Select a non-empty region containing a screen.',
  Busy: 'Please wait for the current operation.',
  ExportBusy: 'Please wait for export.',
  ExportUnavailable: 'Export is not available.',
  SelectionUnavailable: 'Selection is not available.',
  SelectionActive: 'A selection is already active.',
  NoSelection: 'No active selection in this window.',
  DisplaysChanged: 'Display configuration changed. Please capture again.',
  InvalidPng: 'Invalid PNG payload.',
  PngSizeMismatch: 'PNG dimensions do not match this capture.',
  ClipboardUnavailable: 'Could not copy the image to the clipboard.',
  SaveFailed: 'Could not save the image.',
  InvalidShortcuts: 'Use two different shortcuts with a modifier and a letter, number or function key.',
  ShortcutInUse: 'That shortcut is already in use by another app.',
  ShortcutRestoreFailed: 'Could not restore the previous shortcuts. Choose available shortcuts.',
  SettingsNotSaved: 'Could not save the settings.',
  InvalidImageType: 'Choose a valid PNG, JPG, JPEG, SVG or WebP image.',
  ImageTooLarge: 'Choose an image smaller than 20 MiB.',
  ImageUnreadable: 'Could not read the image.',
  NoDisplays: 'No connected displays.',
  InvalidDisplayGeometry: 'Invalid display geometry.',
  DesktopTooLarge: 'The combined desktop is too large (maximum 32 megapixels and 16384 pixels per edge). Reduce display resolution and try again.',
};

export function errorMessage(error: unknown) {
  const name = error instanceof Error ? /^[\w.]+: (\w+)$/.exec(error.message)?.[1] : undefined;
  return (name && messages[name]) || 'Operation failed. Please try again.';
}

async function settle<T>(promise: Promise<T>): Promise<Result<T>> {
  try { return { ok: true, value: await promise }; }
  catch (error) { return { ok: false, error: errorMessage(error) }; }
}

const done = (promise: Promise<void>) => settle(promise.then(() => undefined));

function decodeBase64(value: string) {
  const text = atob(value), bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return bytes;
}

const api: ScreenshotAPI = {
  importImage: async (id: string) => {
    const result = await settle(Screenshot.importImage(id));
    if (!result.ok || !result.value) return result as Result<null>;
    try { return { ok: true as const, value: inspectImage(decodeBase64(result.value.bytes), result.value.extension) }; }
    catch (error) { return { ok: false as const, error: error instanceof Error ? error.message : 'Could not insert image.' }; }
  },
  settings: () => settle(Screenshot.settings()),
  updateShortcuts: value => settle(Screenshot.updateShortcuts(value)),
  selection: (id, phase) => done(Screenshot.selection(id, phase)),
  onSelection: callback => onSelectionChanged(callback),
  capture: request => done(Screenshot.capture(request)),
  current: () => settle(Screenshot.current()),
  crop: (id, rect) => done(Screenshot.crop(id, rect)),
  cancel: id => done(Screenshot.cancel(id)),
  output: (id, action, png) => settle(Screenshot.output(id, action, png)),
};
export const screenshot = Object.freeze(api);
