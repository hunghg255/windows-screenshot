import { BrowserWindow, desktopCapturer, nativeImage, session, type Display, type NativeImage } from 'electron';
import { join } from 'node:path';
export async function captureDisplay(display: Display): Promise<NativeImage> {
  const expected = { width: Math.round(display.bounds.width * display.scaleFactor), height: Math.round(display.bounds.height * display.scaleFactor) };
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: expected });
  const source = sources.find(item => item.display_id === String(display.id));
  if (!source) throw new Error('The selected display is no longer available.');
  const actual = source.thumbnail.getSize();
  console.info('Capture dimensions', { displayId: display.id, expected, actual });
  if (!source.thumbnail.isEmpty() && actual.width === expected.width && actual.height === expected.height) return source.thumbnail;
  // A separate in-memory session grants only this source to this hidden frame reader.
  const isolated = session.fromPartition(`capture-${Date.now()}`);
  const win = new BrowserWindow({ show: false, webPreferences: { session: isolated, sandbox: true, contextIsolation: true, nodeIntegration: false } });
  isolated.setDisplayMediaRequestHandler((request, callback) => {
    if (request.frame === win.webContents.mainFrame) callback({ video: source });
    else callback({});
  });
  try {
    await win.loadFile(join(__dirname, '../../assets/capture-frame.html'));
    const frame = await Promise.race([
      win.webContents.executeJavaScript(`(async () => {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: { width: { ideal: ${expected.width} }, height: { ideal: ${expected.height} } }, audio: false });
        try {
          const video = document.createElement('video'); video.srcObject = stream; await video.play();
          await new Promise(resolve => video.requestVideoFrameCallback(resolve));
          const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
          canvas.getContext('2d').drawImage(video, 0, 0); return canvas.toDataURL('image/png');
        } finally { stream.getTracks().forEach(track => track.stop()); }
      })()`, true),
      new Promise<never>((_, reject) => { const timer = setTimeout(() => reject(new Error('Screen capture timed out.')), 10000); timer.unref(); }),
    ]);
    const image = nativeImage.createFromDataURL(frame);
    if (image.getSize().width !== expected.width || image.getSize().height !== expected.height) throw new Error('The display did not provide a full-resolution frame.');
    return image;
  } finally { isolated.setDisplayMediaRequestHandler(null); win.destroy(); }
}
