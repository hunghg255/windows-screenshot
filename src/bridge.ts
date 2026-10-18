import { isCallError } from 'mygo-runtime';
import type { Result, ScreenshotAPI } from '../shared/contracts';
import { inspectImage } from '../shared/image-import';
import { Screenshot, events } from './mygo';

// Go errors carry user-facing messages; anything else is a bridge failure.
async function settle<T>(promise: Promise<T>): Promise<Result<T>> {
  try { return { ok: true, value: await promise }; }
  catch (error) { return { ok: false, error: isCallError(error) ? error.message : 'Operation failed. Please try again.' }; }
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
  onSelection: callback => events.selectionChanged.on(callback),
  capture: request => done(Screenshot.capture(request)),
  current: () => settle(Screenshot.current()),
  crop: (id, rect) => done(Screenshot.crop(id, rect)),
  cancel: id => done(Screenshot.cancel(id)),
  output: (id, action, png) => settle(Screenshot.output(id, action, png)),
};
export const screenshot = Object.freeze(api);
