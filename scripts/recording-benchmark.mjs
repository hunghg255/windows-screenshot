import { _electron } from '@playwright/test';
import { mkdtemp,writeFile,appendFile } from 'node:fs/promises';
import { tmpdir,cpus,release,totalmem } from 'node:os';
import { join,resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync=promisify(execFile);
const minutesIndex=process.argv.indexOf('--minutes');
const minutes=minutesIndex<0?2:Number(process.argv[minutesIndex+1]);
if(!Number.isFinite(minutes)||minutes<=0||minutes>1440)throw new Error('Use --minutes 1..1440');
const region=process.argv.includes('--region'),fakeMic=process.argv.includes('--fake-mic'),mic=process.argv.includes('--mic')||fakeMic;
const executableIndex=process.argv.indexOf('--executable');
const executable=executableIndex<0?process.env.SCREENSHOT_EXECUTABLE:resolve(process.argv[executableIndex+1]);
const dir=await mkdtemp(join(tmpdir(),'recording-benchmark-'));
const env={...process.env,SCREENSHOT_TEST_USER_DATA:dir};delete env.ELECTRON_RUN_AS_NODE;
const started=Date.now();
const app=await _electron.launch({executablePath:executable,args:[...(executable?[]:[resolve('.')]),...(fakeMic?['--use-fake-device-for-media-stream']:[])],env});
let setup,fixture;
try{
  const settings=await app.firstWindow();await settings.getByRole('button',{name:'Record screen',exact:true}).waitFor();
  const opened=app.waitForEvent('window');await settings.getByRole('button',{name:'Record screen',exact:true}).click();setup=await opened;
  await setup.getByRole('heading',{name:'Screen recording'}).waitFor();
  await app.evaluate(({dialog},dir)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[dir]});},dir);
  await setup.getByRole('button',{name:'Choose folder'}).click();
  const config=await setup.evaluate(async({region,mic})=>{
    const s=await window.recording.sources(),c=await window.recording.settings();if(!s.ok||!c.ok)throw new Error('Missing configuration.');
    const source=s.value[0];
    return {...c.value,sourceId:source.id,mode:region?'region':'full',region:region?{x:10,y:10,width:source.bounds.width-20,height:source.bounds.height-20}:null,mic,countdown:false};
  },{region,mic});
  const sourceBounds=await setup.evaluate(async id=>{const s=await window.recording.sources();if(!s.ok)throw new Error(s.error);return s.value.find(s=>s.id===id).bounds;},config.sourceId);
  // A separate Electron process supplies moving fixture content and is excluded
  // from the recording application's app.getAppMetrics() process tree.
  const fixtureEntry=join(dir,'fixture.cjs');
  const fixtureHTML='<!doctype html><style>body{margin:0;background:#142032;color:white;font:40px sans-serif}canvas{width:100vw;height:100vh}</style><canvas></canvas><script>const c=document.querySelector("canvas"),g=c.getContext("2d");c.width=1920;c.height=1080;let n=0;function draw(){n++;window.fixtureFrames=n;g.fillStyle="#142032";g.fillRect(0,0,c.width,c.height);for(let i=0;i<20;i++){g.fillStyle="hsl("+((n+i*20)%360)+",65%,50%)";g.fillRect((n*4+i*113)%1920,i*50,100,40)}g.fillStyle="white";g.font="48px sans-serif";g.fillText("Recording benchmark "+n,80,100);requestAnimationFrame(draw)}draw()</script>';
  await writeFile(fixtureEntry,'const {app,BrowserWindow}=require("electron");app.whenReady().then(()=>{const w=new BrowserWindow({frame:false,alwaysOnTop:true,webPreferences:{backgroundThrottling:false},...'+JSON.stringify(sourceBounds)+'});w.loadURL('+JSON.stringify('data:text/html,'+encodeURIComponent(fixtureHTML))+');});');
  fixture=await _electron.launch({args:[fixtureEntry],env:{...env,SCREENSHOT_TEST_USER_DATA:undefined}});
  await (await fixture.firstWindow()).waitForFunction(()=>window.fixtureFrames>2);
  const result=await setup.evaluate(c=>window.recording.start(c),config);if(!result.ok)throw new Error(result.error);
  const launchToRecordingMs=Date.now()-started,recordingAt=Date.now();
  const metadata={minutes,mode:config.mode,mic,sourceBounds,launchToRecordingMs,cpu:cpus()[0].model,logicalProcessors:cpus().length,os:release(),ramBytes:totalmem(),dir};
  await writeFile(join(dir,'machine.json'),JSON.stringify(metadata,null,2));
  console.log(JSON.stringify(metadata));
  let previous=new Map(),previousTime=Date.now(),peakMB=0,nextPrivateSample=0;
  while(Date.now()-recordingAt<minutes*60000){
    await new Promise(r=>setTimeout(r,5000));
    const state=await setup.evaluate(()=>window.recording.getState());if(!state.ok||state.value.state==='error')throw new Error(state.ok?state.value.error:state.error);
    const metrics=await app.evaluate(({app})=>app.getAppMetrics());
    const time=Date.now();let delta=0;
    for(const m of metrics){const current=m.cpu.cumulativeCPUUsage;if(current!==undefined&&previous.has(m.pid))delta+=Math.max(0,current-previous.get(m.pid));if(current!==undefined)previous.set(m.pid,current);}
    const row={seconds:(time-recordingAt)/1000,state:state.value.state,bytes:state.value.bytes,workingSetMB:metrics.reduce((sum,m)=>sum+m.memory.workingSetSize,0)/1024,privateMB:metrics.reduce((sum,m)=>sum+(m.memory.privateBytes??0),0)/1024,cpuMachinePercent:delta/((time-previousTime)/1000)/cpus().length*100,processes:metrics.map(m=>({pid:m.pid,type:m.type,workingSetKB:m.memory.workingSetSize,privateKB:m.memory.privateBytes,cpu:m.cpu}))};
    if(process.platform==='win32' && row.seconds>=nextPrivateSample){
      const filter=metrics.map(m=>'IDProcess = '+Number(m.pid)).join(' OR ');
      const command='Get-CimInstance -Query "SELECT IDProcess,WorkingSetPrivate FROM Win32_PerfFormattedData_PerfProc_Process WHERE '+filter+'" | Select-Object IDProcess,WorkingSetPrivate | ConvertTo-Json -Compress';
      try {
        const {stdout}=await execFileAsync('powershell.exe',['-NoProfile','-Command',command],{windowsHide:true,timeout:60000});
        const samples=JSON.parse(stdout);row.privateWorkingSetMB=(Array.isArray(samples)?samples:[samples]).reduce((sum,s)=>sum+Number(s.WorkingSetPrivate),0)/1000000;
      }catch(e){row.privateWorkingSetError=String(e.message);}
      nextPrivateSample=row.seconds+60;
    }
    row.inputFrames=state.value.inputFrames;row.maxInputGapMs=state.value.maxInputGapMs;
    row.fixture=await (await fixture.firstWindow()).evaluate(()=>({frames:window.fixtureFrames,visibility:document.visibilityState}));
    peakMB=Math.max(peakMB,row.workingSetMB);previousTime=time;
    await appendFile(join(dir,'metrics.jsonl'),JSON.stringify(row)+'\n');
    if(Math.floor(row.seconds/5)%12===0)console.log(JSON.stringify({seconds:row.seconds,workingSetMB:row.workingSetMB,privateMB:row.privateMB,cpuMachinePercent:row.cpuMachinePercent}));
  }
  const stop=await setup.evaluate(()=>window.recording.stop());if(!stop.ok)throw new Error(stop.error);
  while(true){
    const s=await setup.evaluate(()=>window.recording.getState());if(!s.ok||s.value.state==='error')throw new Error(s.ok?s.value.error:s.error);
    if(s.value.state==='done'){console.log(JSON.stringify({peakWorkingSetMB:peakMB,result:s.value.result}));break;}
    await new Promise(r=>setTimeout(r,1000));
  }
}finally{
  await fixture?.close();
  if(setup)await setup.evaluate(()=>window.recording.stop()).catch(()=>{});
  await app.close();
}
