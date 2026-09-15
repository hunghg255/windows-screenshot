import { _electron as electron,chromium,expect,test } from '@playwright/test';
import { mkdtemp,stat,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run=promisify(execFile);
test.use({trace:'off',screenshot:'off',video:'off'});
test('records full screen with pause and creates a seekable WebM',async()=>{
  test.setTimeout(120000);
  const dir=await mkdtemp(join(tmpdir(),'recording-e2e-'));
  const env:Record<string,string|undefined>={...process.env,SCREENSHOT_TEST_USER_DATA:dir};delete env.ELECTRON_RUN_AS_NODE;
  const app=await electron.launch({args:[resolve('.')],env:env as Record<string,string>});
  try{
    const settings=await app.firstWindow();await expect(settings.getByRole('button',{name:'Record screen',exact:true})).toBeVisible();
    const opened=app.waitForEvent('window');await settings.getByRole('button',{name:'Record screen',exact:true}).click();
    const setup=await opened;await expect(setup.getByRole('heading',{name:'Screen recording'})).toBeVisible();
    await app.evaluate(({dialog},dir)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[dir]});},dir);
    await setup.getByRole('button',{name:'Choose folder'}).click();
    await setup.getByLabel('3-second countdown').uncheck();
    await setup.getByRole('button',{name:'Start recording',exact:true}).click();
    await expect.poll(async()=>{const r=await setup.evaluate(()=>window.recording.getState());if(!r.ok)throw new Error(r.error);if(r.value.error)throw new Error(r.value.error);return r.value.state;},{timeout:25000}).toBe('recording');
    await setup.waitForTimeout(3500);
    expect((await setup.evaluate(()=>window.recording.pause())).ok).toBe(true);
    await setup.waitForTimeout(1000);
    expect((await setup.evaluate(()=>window.recording.resume())).ok).toBe(true);
    await setup.waitForTimeout(2500);
    expect((await setup.evaluate(()=>window.recording.stop())).ok).toBe(true);
    await expect.poll(async()=>{const r=await setup.evaluate(()=>window.recording.getState());if(!r.ok)throw new Error(r.error);if(r.value.error)throw new Error(r.value.error);return r.value.state;},{timeout:30000}).toBe('done');
    const result=await setup.evaluate(async()=>{const r=await window.recording.getState();if(!r.ok||!r.value.result)throw new Error('Missing result');return r.value.result;});
    expect((await stat(result.path)).size).toBeGreaterThan(10000);
    expect(result.durationMs).toBeGreaterThan(5000);expect(result.durationMs).toBeLessThan(9000);
    const html=join(dir,'player.html');
    await writeFile(html,'<!doctype html><video controls src="'+new URL('file:///'+result.path.replaceAll('\\','/')).href+'"></video>');
    const playing=app.waitForEvent('window');
    await app.evaluate(async({BrowserWindow},html)=>{const player=new BrowserWindow({show:false});await player.loadFile(html);},html);
    const player=await playing;
    await expect.poll(()=>player.locator('video').evaluate(v=>(v as HTMLVideoElement).readyState)).toBeGreaterThan(0);
    const metadata=await player.locator('video').evaluate(v=>({duration:(v as HTMLVideoElement).duration,width:(v as HTMLVideoElement).videoWidth,height:(v as HTMLVideoElement).videoHeight}));
    expect(Number.isFinite(metadata.duration)).toBe(true);expect(metadata.width).toBeLessThanOrEqual(1920);expect(metadata.height).toBeLessThanOrEqual(1080);
    await player.locator('video').evaluate(v=>{(v as HTMLVideoElement).currentTime=(v as HTMLVideoElement).duration*.8;});
    await expect.poll(()=>player.locator('video').evaluate(v=>(v as HTMLVideoElement).seeking)).toBe(false);
    const chrome=await chromium.launch({channel:'chrome',headless:true});
    try{
      const page=await chrome.newPage();await page.goto(new URL('file:///'+html.replaceAll('\\','/')).href);
      await expect.poll(()=>page.locator('video').evaluate(v=>(v as HTMLVideoElement).readyState)).toBeGreaterThan(0);
      for(const fraction of [.1,.5,.9]){
        await page.locator('video').evaluate((v,f)=>{(v as HTMLVideoElement).currentTime=(v as HTMLVideoElement).duration*f;},fraction);
        await expect.poll(()=>page.locator('video').evaluate(v=>(v as HTMLVideoElement).seeking)).toBe(false);
      }
    }finally{await chrome.close();}
    expect(await settings.evaluate(async()=>{const r=await window.recording.start({sourceId:'forged',mode:'full',mic:false,micId:'',region:null,countdown:false});return r.ok;})).toBe(false);
  }finally{await app.close();}
});

test('native recording shortcuts and ten consecutive sessions clean up windows',async()=>{
  test.setTimeout(180000);
  const dir=await mkdtemp(join(tmpdir(),'recording-cycles-'));
  const env:Record<string,string|undefined>={...process.env,SCREENSHOT_TEST_USER_DATA:dir};delete env.ELECTRON_RUN_AS_NODE;
  const app=await electron.launch({args:[resolve('.')],env:env as Record<string,string>});
  try {
    const settings=await app.firstWindow();await settings.getByRole('button',{name:'Record screen',exact:true}).waitFor();
    const opened=app.waitForEvent('window');await settings.getByRole('button',{name:'Record screen',exact:true}).click();const setup=await opened;
    await setup.getByRole('heading',{name:'Screen recording'}).waitFor();
    await app.evaluate(({dialog},dir)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[dir]});},dir);
    await setup.getByRole('button',{name:'Choose folder'}).click();
    const config=await setup.evaluate(async()=>{
      const s=await window.recording.sources(),c=await window.recording.settings();if(!s.ok||!c.ok)throw new Error('Missing setup');
      return {...c.value,sourceId:s.value[0].id,countdown:false,stopShortcut:'Ctrl+Alt+Shift+F21',pauseShortcut:'Ctrl+Alt+Shift+F22'};
    });
    expect((await setup.evaluate(c=>window.recording.saveSettings(c),config)).ok).toBe(true);
    await setup.locator('.recording-preview').evaluate(el=>{el.setAttribute('src','data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="150"><rect width="240" height="150" fill="#142032"/><rect x="30" y="25" width="180" height="100" rx="6" fill="#263e59"/><path d="M45 108L88 63L124 94L159 48L195 108Z" fill="#5d94c4"/></svg>'));});
    await setup.screenshot({path:'test-results/recording-setup-ui.png',fullPage:true});
    for(let i=0;i<10;i++) {
      expect((await setup.evaluate(c=>window.recording.start(c),config)).ok).toBe(true);
      await setup.waitForTimeout(1200);
      if(i===0){
        for(const [key,state] of [[133,'paused'],[133,'recording'],[132,'done']] as const){
          await run('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',resolve('tests/e2e/native-hotkey.ps1'),'-X','100','-Y','200','-VirtualKey',String(key)],{windowsHide:true});
          await expect.poll(async()=>{const s=await setup.evaluate(()=>window.recording.getState());return s.ok?s.value.state:'';},{timeout:20000}).toBe(state);
        }
      }else{
        expect((await setup.evaluate(()=>window.recording.stop())).ok).toBe(true);
        await expect.poll(async()=>{const s=await setup.evaluate(()=>window.recording.getState());if(s.ok&&s.value.error)throw new Error(s.value.error);return s.ok?s.value.state:'';},{timeout:20000}).toBe('done');
      }
      expect(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length)).toBe(2);
    }
  }finally{await app.close();}
});

test('region with microphone, mute, countdown cancellation and recovery',async()=>{
  test.setTimeout(150000);
  const dir=await mkdtemp(join(tmpdir(),'recording-region-e2e-'));
  const env:Record<string,string|undefined>={...process.env,SCREENSHOT_TEST_USER_DATA:dir};delete env.ELECTRON_RUN_AS_NODE;
  const app=await electron.launch({args:[resolve('.'),'--use-fake-device-for-media-stream'],env:env as Record<string,string>});
  try{
    const settings=await app.firstWindow();await expect(settings.getByRole('button',{name:'Record screen',exact:true})).toBeVisible();
    const opened=app.waitForEvent('window');await settings.getByRole('button',{name:'Record screen',exact:true}).click();const setup=await opened;
    await expect(setup.getByRole('heading',{name:'Screen recording'})).toBeVisible();
    await app.evaluate(({dialog},dir)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[dir]});},dir);
    await setup.getByRole('button',{name:'Choose folder'}).click();
    const config=await setup.evaluate(async()=>{
      const s=await window.recording.sources(),c=await window.recording.settings();
      if(!s.ok||!c.ok)throw new Error('Missing sources/settings.');
      return {...c.value,sourceId:s.value[0].id};
    });
    const regionWindow=app.waitForEvent('window');
    expect((await setup.evaluate(id=>window.recording.selectRegion(id),config.sourceId)).ok).toBe(true);
    const overlay=await regionWindow;await expect(overlay.getByText('Drag to select a recording area')).toBeVisible();
    await overlay.mouse.move(200,250);await overlay.mouse.down();await overlay.mouse.move(520,490);await overlay.mouse.up();
    await expect(overlay.getByRole('button',{name:'Use region'})).toBeEnabled();
    await overlay.getByRole('button',{name:'Use region'}).click();await expect.poll(()=>overlay.isClosed()).toBe(true);
    const region=await setup.evaluate(async()=>{const r=await window.recording.getState();if(!r.ok)throw new Error(r.error);return r.value.region;});
    expect(region).toEqual({x:200,y:250,width:320,height:240});
    const starting=setup.evaluate(c=>window.recording.start(c),{...config,mode:'region' as const,region,countdown:true});
    await expect.poll(async()=>{const r=await setup.evaluate(()=>window.recording.getState());return r.ok?r.value.state:'';}).toBe('countdown');
    expect((await setup.evaluate(()=>window.recording.stop())).ok).toBe(true);await starting;
    await expect.poll(async()=>{const r=await setup.evaluate(()=>window.recording.getState());return r.ok?r.value.state:'';}).toBe('ready');
    const preparing=setup.evaluate(c=>window.recording.start(c),{...config,mode:'region' as const,region,mic:true,countdown:false});
    await expect.poll(async()=>{const r=await setup.evaluate(()=>window.recording.getState());return r.ok?r.value.state:'';}).toBe('countdown');
    await setup.waitForTimeout(500);
    expect((await setup.evaluate(()=>window.recording.stop())).ok).toBe(true);await preparing;
    expect(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().filter(w=>w.webContents.getURL().endsWith('#recorder')).length)).toBe(0);
    await expect.poll(async()=>{const r=await setup.evaluate(()=>window.recording.getState());return r.ok?r.value.state:'';}).toBe('ready');
    expect((await setup.evaluate(c=>window.recording.start(c),{...config,mode:'region' as const,region,mic:true,countdown:false})).ok).toBe(true);
    const worker=app.windows().find(p=>p.url().endsWith('#recorder'))!;
    expect(await worker.evaluate(async()=>{try{const stream=await navigator.mediaDevices.getUserMedia({video:true});stream.getTracks().forEach(t=>t.stop());return true;}catch{return false;}})).toBe(false);
    expect((await setup.evaluate(()=>window.recording.chunk('forged',0,new ArrayBuffer(1)))).ok).toBe(false);
    await setup.waitForTimeout(2500);
    expect((await setup.evaluate(()=>window.recording.mute(true))).ok).toBe(true);
    await setup.waitForTimeout(1000);
    expect((await setup.evaluate(()=>window.recording.mute(false))).ok).toBe(true);
    expect((await setup.evaluate(()=>window.recording.stop())).ok).toBe(true);
    await expect.poll(async()=>{const r=await setup.evaluate(()=>window.recording.getState());if(r.ok&&r.value.error)throw new Error(r.value.error);return r.ok?r.value.state:'';},{timeout:30000}).toBe('done');
    // Start another recording and kill only its renderer to exercise the real journal path.
    expect((await setup.evaluate(c=>window.recording.start(c),{...config,mode:'full' as const,mic:false,countdown:false})).ok).toBe(true);
    await setup.waitForTimeout(3500);
    await app.evaluate(({BrowserWindow})=>{BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('#recorder'))!.webContents.forcefullyCrashRenderer();});
    await expect.poll(async()=>{const r=await setup.evaluate(()=>window.recording.getState());return r.ok?r.value.state:'';}).toBe('error');
    const recoveries=await setup.evaluate(()=>window.recording.recoveries());expect(recoveries.ok).toBe(true);
    if(!recoveries.ok || !recoveries.value.length)throw new Error('No partial recording.');
    const recovered=await setup.evaluate(id=>window.recording.recover(id),recoveries.value[0].id);expect(recovered).toMatchObject({ok:true});
  }finally{await app.close();}
});
