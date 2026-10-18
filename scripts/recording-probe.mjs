import { _electron } from '@playwright/test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const dir = await mkdtemp(join(tmpdir(), 'recording-probe-'));
const entry = join(dir, 'main.cjs');
await writeFile(entry, `const { app, BrowserWindow, session, desktopCapturer } = require('electron');
app.whenReady().then(async () => {
 session.defaultSession.setDisplayMediaRequestHandler(async (_, cb) => cb({video:(await desktopCapturer.getSources({types:['screen']}))[0]}));
 const w = new BrowserWindow({show:false, webPreferences:{backgroundThrottling:false}});
 await w.loadURL('file://' + ${JSON.stringify(join(dir, 'probe.html').replaceAll('\\', '/'))});
});`);
await writeFile(join(dir, 'probe.html'), '<!doctype html><title>Recording API probe</title>');
const env = {...process.env}; delete env.ELECTRON_RUN_AS_NODE;
const app = await _electron.launch({args:[entry],env});
try {
 const page = await app.firstWindow();
 console.log(JSON.stringify(await page.evaluate(async () => {
  const capabilities = {processor:typeof MediaStreamTrackProcessor,generator:typeof MediaStreamTrackGenerator,videoFrame:typeof VideoFrame,vp8:MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')};
  try { const stream = await navigator.mediaDevices.getDisplayMedia({video:{frameRate:30},audio:false}); const settings=stream.getVideoTracks()[0].getSettings(); stream.getTracks().forEach(t=>t.stop()); return {capabilities,settings}; } catch(e){return {capabilities,error:String(e)}}
 }),null,2));
} finally {await app.close();}
