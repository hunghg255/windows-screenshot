import { app, BrowserWindow, desktopCapturer, dialog, globalShortcut, ipcMain, powerMonitor, powerSaveBlocker, screen, session, shell, systemPreferences, type WebContents, type MenuItemConstructorOptions } from 'electron';
import { randomUUID } from 'node:crypto';
import { open, readFile, writeFile, rename, stat, statfs, unlink, readdir } from 'node:fs/promises';
import { join, basename, dirname } from 'node:path';
import { RecordingSession } from './session';
import { RecordingWriter } from './file-writer';
import { finalizeRecording } from './finalize';
import { diskStatus, canFinalize } from './disk';
import { recordingDefaults, validRecordingConfig, validRegion, type RecordingConfig, type RecordingSettings, type RecordingSource, type RecorderCommand, type RecorderAck, type RecordingResult } from '../../shared/recording-contracts';
import { recordingCrop } from '../../shared/recording-geometry';
import type { Rect } from '../../shared/contracts';

export class RecordingController {
  readonly state = new RecordingSession();
  private setup: BrowserWindow | null = null;
  private recorder: BrowserWindow | null = null;
  private overlay: BrowserWindow | null = null;
  private settings: RecordingSettings = { ...recordingDefaults };
  private source: RecordingSource | null = null;
  private writer: RecordingWriter | null = null;
  private target = '';
  private journal = '';
  private block: number | null = null;
  private starting = false;
  private operation = false;
  private closing = false;
  private quitRequested = false;
  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  private clock: ReturnType<typeof setInterval> | null = null;
  private diskTimer: ReturnType<typeof setInterval> | null = null;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;
  private readyResolve: (() => void) | null = null;
  private pending = new Map<string, {resolve:()=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
  private results = new Map<string, RecordingResult>();
  private configPath = join(app.getPath('userData'),'recording-settings.json');
  private registered: string[] = [];
  constructor(private baseURL:string,private preload:string,private isSettings:(wc:WebContents)=>boolean,private captureActive:()=>boolean,private changed:()=>void) {}
  get busy() { return this.starting || this.operation || this.state.busy; }
  private emit() {
    const snapshot=this.state.snapshot();
    for(const win of [this.setup,this.overlay])if(win && !win.isDestroyed())win.webContents.send('recording:state',snapshot);
    this.changed();
  }
  private window(view:string,overlay=false) {
    const win=new BrowserWindow({width:760,height:780,minWidth:overlay?1:620,minHeight:overlay?1:550,show:false,frame:!overlay,transparent:overlay,alwaysOnTop:overlay,skipTaskbar:overlay || view==='recorder',resizable:!overlay,backgroundColor:overlay?'#00000000':'#101010',
      webPreferences:{preload:this.preload,sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:view!=='recorder'}});
    win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    win.webContents.on('will-navigate',e=>e.preventDefault());
    win.webContents.on('will-attach-webview',e=>e.preventDefault());
    void win.loadURL(this.baseURL+'#'+view);
    return win;
  }
  show() {
    if(!this.setup || this.setup.isDestroyed()){
      this.setup=this.window('recording');
      this.setup.once('ready-to-show',()=>this.setup?.show());
      this.setup.on('close',e=>{if(!this.closing){e.preventDefault();this.setup?.hide();}});
    }else {this.setup.show();this.setup.focus();}
  }
  menu():MenuItemConstructorOptions[] {
    return [{label:'Record screen…',click:()=>this.show()},
      ...(this.state.busy?[{label:`Recording: ${Math.floor(this.state.snapshot().elapsedMs/1000)}s`,enabled:false},
        {label:this.state.value.state==='paused'?'Resume recording':'Pause recording',enabled:['recording','paused'].includes(this.state.value.state),click:()=>void this.control(this.state.value.state==='paused'?'resume':'pause').catch(e=>this.fail(e))},
        {label:'Stop recording',enabled:['recording','paused','countdown'].includes(this.state.value.state),click:()=>void this.stop().catch(e=>this.fail(e))}]:[])];
  }
  private handle(channel:string,roles:('setup'|'recorder'|'overlay'|'settings')[],action:(...args:any[])=>unknown) {
    ipcMain.handle(channel,async(event,...args:unknown[])=>{
      try {
        const sender=event.sender;
        const role=sender===this.setup?.webContents?'setup':sender===this.recorder?.webContents?'recorder':sender===this.overlay?.webContents?'overlay':this.isSettings(sender)?'settings':null;
        if(!role || !roles.includes(role) || event.senderFrame!==sender.mainFrame || sender.getURL().split('#')[0]!==new URL(this.baseURL).href)throw new Error('Unauthorized request.');
        return {ok:true,value:await action(...args)};
      }catch(e){return {ok:false,error:e instanceof Error?e.message:'Recording failed.'};}
    });
  }
  async init() {
    try {const saved=JSON.parse(await readFile(this.configPath,'utf8'));if(this.validSettings(saved))this.settings=saved;}catch{/* Defaults for missing/invalid configuration. */}
    this.handle('recording:open',['settings'],()=>this.show());
    this.handle('sources:list',['setup'],()=>this.sources());
    this.handle('recording:get-state',['setup','overlay'],()=>this.state.snapshot());
    this.handle('settings:get',['setup'],()=>this.settings);
    this.handle('settings:set',['setup'],(value:unknown)=>this.saveSettings(value));
    this.handle('recording:choose-directory',['setup'],async()=>{
      if(this.busy)throw new Error('Stop recording before changing the folder.');
      const selected=await dialog.showOpenDialog(this.setup!,{properties:['openDirectory','createDirectory'],defaultPath:this.settings.directory||app.getPath('videos')});
      if(selected.canceled)return null;
      this.settings.directory=selected.filePaths[0];await this.persist();return this.settings.directory;
    });
    this.handle('disk:check',['setup'],()=>this.free());
    this.handle('permissions:check',['setup'],()=>({screen:process.platform==='darwin'?systemPreferences.getMediaAccessStatus('screen'):'unknown',microphone:systemPreferences.getMediaAccessStatus('microphone')}));
    this.handle('region:open',['setup'],(id:unknown)=>this.selectRegion(id));
    this.handle('region:selected',['overlay'],(rect:unknown)=>this.selected(rect));
    this.handle('recording:start',['setup'],(config:unknown)=>this.start(config));
    this.handle('recording:pause',['setup'],()=>this.control('pause'));
    this.handle('recording:resume',['setup'],()=>this.control('resume'));
    this.handle('recording:stop',['setup'],()=>this.stop());
    this.handle('recording:mute',['setup'],async(muted:unknown)=>{
      if(typeof muted!=='boolean' || !['recording','paused'].includes(this.state.value.state))throw new Error('Cannot mute now.');
      await this.command('mute',{muted});this.state.update({muted});this.emit();
    });
    this.handle('recording:reset',['setup'],()=>{if(this.busy)throw new Error('Recording is busy.');this.state.move('idle');this.state.update({error:'',warning:'',result:null});this.emit();});
    this.handle('recording:ready',['recorder'],()=>{this.readyResolve?.();this.readyResolve=null;});
    this.handle('recording:ack',['recorder'],(ack:RecorderAck)=>{
      if(!ack || ack.id!==this.state.value.id || typeof ack.requestId!=='string')throw new Error('Stale recording command.');
      const pending=this.pending.get(ack.requestId);if(pending){clearTimeout(pending.timer);this.pending.delete(ack.requestId);ack.error?pending.reject(new Error(String(ack.error).slice(0,500))):pending.resolve();}
    });
    this.handle('recording:chunk',['recorder'],async(id:unknown,seq:unknown,data:unknown)=>{
      if(id!==this.state.value.id || !this.writer || typeof seq!=='number' || !(data instanceof ArrayBuffer))throw new Error('Invalid recording chunk.');
      try{await this.writer.append(seq,new Uint8Array(data));this.state.update({bytes:this.writer.bytes});}catch(e){await this.fail(e);throw e;}
    });
    this.handle('recording:end',['recorder'],(id:unknown,last:unknown)=>this.finish(id,last));
    this.handle('recording:error',['recorder'],(id:unknown,message:unknown)=>{if(id===this.state.value.id)return this.fail(new Error(String(message).slice(0,500)));});
    this.handle('recording:warning',['recorder'],(id:unknown,message:unknown)=>{if(id===this.state.value.id){this.state.update({warning:String(message).slice(0,500)});this.emit();}});
    this.handle('recording:frames',['recorder'],(id:unknown,frames:unknown,gap:unknown)=>{
      if(id!==this.state.value.id || typeof frames!=='number' || !Number.isSafeInteger(frames) || frames<0 || typeof gap!=='number' || !Number.isFinite(gap) || gap<0 || gap>3600000)throw new Error('Invalid frame measurements.');
      this.state.update({inputFrames:frames,maxInputGapMs:gap});
    });
    this.handle('shell:open-file',['setup'],async(id:string)=>{const r=this.results.get(id);if(!r)throw new Error('Unknown recording.');const error=await shell.openPath(r.path);if(error)throw new Error(error);});
    this.handle('shell:open-folder',['setup'],(id:string)=>{const r=this.results.get(id);if(!r)throw new Error('Unknown recording.');shell.showItemInFolder(r.path);});
    this.handle('recording:recovery-list',['setup'],()=>this.recoveries());
    this.handle('recording:recover',['setup'],(id:unknown)=>this.recover(id));
    const allowed=(wc:WebContents|null)=>wc===this.recorder?.webContents || wc===this.setup?.webContents;
    session.defaultSession.setPermissionCheckHandler((wc,permission,origin,details)=>allowed(wc) && permission==='media' && details.isMainFrame!==false && (origin===new URL(this.baseURL).origin || origin==='file://') && details.mediaType==='audio');
    session.defaultSession.setPermissionRequestHandler((wc,permission,cb,details)=>cb(allowed(wc) && permission==='media' && details.isMainFrame!==false && 'mediaTypes' in details && details.mediaTypes?.every((t:string)=>t==='audio')===true));
    session.defaultSession.setDisplayMediaRequestHandler((request,cb)=>{
      if(!this.recorder || request.frame!==this.recorder.webContents.mainFrame || !this.source || !this.starting && !this.state.busy){cb({});return;}
      cb({video:{id:this.source.id,name:this.source.name}});
    });
    try{this.registerHotkeys();}catch(e){this.state.update({warning:String(e)});}
    const changed=()=>{this.setup?.webContents.send('sources:changed');if(this.busy && this.state.value.state!=='finalizing')void this.interrupted('Display configuration changed.');};
    screen.on('display-added',()=>this.setup?.webContents.send('sources:changed'));screen.on('display-removed',changed);screen.on('display-metrics-changed',changed);
    powerMonitor.on('suspend',()=>void this.interrupted('Computer suspended.'));
    powerMonitor.on('lock-screen',()=>void this.interrupted('Computer locked.'));
    app.on('before-quit',event=>{
      if(this.busy){event.preventDefault();this.quitRequested=true;void this.stop().catch(e=>this.fail(e));return;}
      this.closing=true;for(const key of this.registered)globalShortcut.unregister(key);
    });
  }
  private async persist(){await writeFile(this.configPath+'.new',JSON.stringify(this.settings),'utf8');await rename(this.configPath+'.new',this.configPath);}
  private validSettings(value:unknown):value is RecordingSettings {
    if(!validRecordingConfig(value))return false;const s=value as RecordingSettings;
    return typeof s.directory==='string' && s.directory.length<32768 && [s.pauseShortcut,s.stopShortcut].every(k=>typeof k==='string' && /^(?:(?:Ctrl|Alt|Shift|Super)\+)+(?:[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4]))$/.test(k)) && s.pauseShortcut.split('+').sort().join('+')!==s.stopShortcut.split('+').sort().join('+');
  }
  private registerHotkeys() {
    const old=[...this.registered];for(const key of old)globalShortcut.unregister(key);this.registered=[];
    try {
      for(const [key,fn] of [[this.settings.stopShortcut,()=>void this.stop().catch(e=>this.fail(e))],[this.settings.pauseShortcut,()=>void this.control(this.state.value.state==='paused'?'resume':'pause').catch(()=>{})]] as const){
        if(!globalShortcut.register(key,fn))throw new Error(`Shortcut ${key} is already in use.`);this.registered.push(key);
      }
    }catch(e){for(const key of this.registered)globalShortcut.unregister(key);this.registered=[];throw e;}
  }
  private async saveSettings(value:unknown) {
    if(this.busy || !this.validSettings(value))throw new Error('Invalid recording settings.');
    if(value.directory!==this.settings.directory)throw new Error('Choose the recording folder using the folder picker.');
    const old=this.settings;this.settings=value;
    try{this.registerHotkeys();await this.persist();}catch(e){this.settings=old;this.registerHotkeys();throw e;}
  }
  private async sources():Promise<RecordingSource[]> {
    const displays=screen.getAllDisplays(),sources=await desktopCapturer.getSources({types:['screen'],thumbnailSize:{width:240,height:150}});
    const primary=screen.getPrimaryDisplay().id;
    return sources.flatMap(s=>{const d=displays.find(d=>String(d.id)===s.display_id);return d?[{id:s.id,displayId:d.id,name:s.name,thumbnail:s.thumbnail.toDataURL(),bounds:d.bounds,scaleFactor:d.scaleFactor}]:[];})
      .sort((a,b)=>Number(b.displayId===primary)-Number(a.displayId===primary));
  }
  private async selectRegion(id:unknown) {
    if(this.busy)throw new Error('Stop recording first.');
    this.source=(await this.sources()).find(s=>s.id===id)??null;if(!this.source)throw new Error('Screen is no longer available.');
    this.state.prepare();this.state.move('selecting-region');this.state.update({region:null});
    this.overlay?.destroy();this.overlay=this.window('recording-region',true);this.overlay.setBounds(this.source.bounds);
    this.overlay.once('ready-to-show',()=>{this.overlay?.show();this.overlay?.focus();});
    this.overlay.on('closed',()=>{this.overlay=null;if(this.state.value.state==='selecting-region'){this.state.move('ready');this.emit();}});
    this.emit();
  }
  private selected(rect:unknown) {
    if(rect!==null){
      if(!validRegion(rect) || !this.source)throw new Error('Invalid region.');
      const d=this.source;recordingCrop(rect,d.bounds,Math.round(d.bounds.width*d.scaleFactor),Math.round(d.bounds.height*d.scaleFactor));
      if(rect.width*d.scaleFactor<100 || rect.height*d.scaleFactor<100)throw new Error('Select at least 100 × 100 pixels.');
    }
    this.state.update({region:rect as Rect|null});this.state.move('ready');this.overlay?.destroy();this.overlay=null;this.emit();this.show();
  }
  private async free() {if(!this.settings.directory)throw new Error('Choose a recording folder.');const s=await statfs(this.settings.directory);return s.bavail*s.bsize;}
  private async start(config:unknown) {
    if(this.busy || this.captureActive())throw new Error('Finish the current capture or recording first.');
    if(!validRecordingConfig(config))throw new Error('Invalid recording configuration.');
    this.starting=true;
    try {
      this.source=(await this.sources()).find(s=>s.id===config.sourceId)??null;if(!this.source)throw new Error('Choose an available screen.');
      if(config.mode==='region'){
        if(!config.region)throw new Error('Choose a region first.');
        if(config.region.width*this.source.scaleFactor<100 || config.region.height*this.source.scaleFactor<100)throw new Error('Select at least 100 × 100 pixels.');
        recordingCrop(config.region,this.source.bounds,this.source.bounds.width,this.source.bounds.height);
      }
      const status=diskStatus(await this.free());if(status==='stop')throw new Error('Less than 500 MB available. Choose another folder.');
      if(status==='warn'){const r=await dialog.showMessageBox(this.setup!,{type:'warning',message:'Less than 5 GB available for recording.',buttons:['Cancel','Record anyway'],defaultId:0,cancelId:0});if(r.response!==1)return;}
      this.state.prepare();this.state.update({region:config.region});this.state.move('countdown');this.emit();
      this.target=join(this.settings.directory,'Recording_'+new Date().toISOString().replace(/[:.]/g,'-')+'_'+this.state.value.id.slice(0,8)+'.webm');
      this.journal=join(app.getPath('userData'),'recording-'+this.state.value.id+'.json');
      this.writer=new RecordingWriter(this.target+'.part');await this.writer.create();
      await writeFile(this.journal,JSON.stringify({id:this.state.value.id,part:this.writer.path,target:this.target}),'utf8');
      this.recorder=this.window('recorder');
      this.recorder.webContents.on('render-process-gone',()=>{if(this.recorder)void this.fail(new Error('Recorder closed unexpectedly. The partial file was kept.'));});
      await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>{this.readyResolve=null;reject(new Error('Recorder did not load.'));},15000);this.readyResolve=()=>{clearTimeout(timer);resolve();};});
      if(config.countdown)await new Promise<void>(resolve=>{let count=3;this.state.update({countdown:count});this.emit();this.countdownTimer=setInterval(()=>{count--;this.state.update({countdown:count});this.emit();if(count<=0 || this.state.value.state!=='countdown'){clearInterval(this.countdownTimer!);this.countdownTimer=null;resolve();}},1000);});
      if(this.state.value.state!=='countdown')return;
      if(diskStatus(await this.free())==='stop')throw new Error('Not enough free disk space.');
      this.setup?.hide();await this.command('start',{config,source:{...this.source,thumbnail:''}});
      if(this.state.value.state!=='countdown')return;
      this.state.move('recording');this.block=powerSaveBlocker.start('prevent-app-suspension');
      this.clock=setInterval(()=>this.emit(),1000);
      this.diskTimer=setInterval(()=>void this.free().then(n=>{if(diskStatus(n)==='stop')return this.interrupted('Disk space is low. Recording stopped.');}).catch(e=>this.fail(e)),30000);
      this.settings={...this.settings,...config};await this.persist();this.emit();
    }catch(e){await this.fail(e);throw e;}finally{
      this.starting=false;
      if(this.state.value.state==='ready') {
        const part=this.writer?.path;await this.cleanup();
        if(part){await unlink(part).catch(()=>{});await unlink(this.journal).catch(()=>{});}
      }
      if(this.quitRequested && !this.busy)app.quit();
    }
  }
  private command(action:RecorderCommand['action'],extra:Partial<RecorderCommand>={}) {
    if(!this.recorder || this.recorder.isDestroyed())return Promise.reject(new Error('Recorder is unavailable.'));
    const requestId=randomUUID(),id=this.state.value.id;
    return new Promise<void>((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(requestId);reject(new Error('Recorder command timed out.'));},15000);
      this.pending.set(requestId,{resolve,reject,timer});this.recorder!.webContents.send('recording:command',{...extra,id,requestId,action});
    });
  }
  async control(action:'pause'|'resume') {
    if(this.operation || this.state.value.state!==(action==='pause'?'recording':'paused'))return;
    this.operation=true;
    try{await this.command(action);if(this.state.value.state===(action==='pause'?'recording':'paused')){this.state.move(action==='pause'?'paused':'recording');this.emit();}}finally{this.operation=false;}
  }
  async stop() {
    if(this.state.value.state==='countdown'){
      this.state.move('ready');this.emit();
      if(!this.starting)await this.cleanup();return;
    }
    if(!['recording','paused','countdown'].includes(this.state.value.state))return;
    this.state.move('stopping');this.emit();
    this.stopTimer=setTimeout(()=>void this.fail(new Error('Final recording chunk did not arrive. Partial file kept.')),30000);
    await this.command('stop');
  }
  private async interrupted(message:string){
    if(!['recording','paused','countdown'].includes(this.state.value.state))return;
    this.state.update({warning:message});
    try{await this.stop();}catch(e){await this.fail(e);}
  }
  private async finish(id:unknown,last:unknown) {
    if(id!==this.state.value.id || typeof last!=='number' || !this.writer || this.state.value.state!=='stopping')throw new Error('Unexpected end of recording.');
    try {
      if(this.stopTimer)clearTimeout(this.stopTimer);this.stopTimer=null;
      await this.writer.finish(last);this.state.move('finalizing');this.emit();
      if(!canFinalize(await this.free(),this.writer.bytes))throw new Error('Not enough space to finalize. Free space and recover this recording.');
      const finalized=await finalizeRecording(this.writer.path,this.target);
      const result={id:this.state.value.id,path:this.target,...finalized};this.results.set(result.id,result);
      if(this.results.size>20)this.results.delete(this.results.keys().next().value!);
      const removed=await Promise.allSettled([unlink(this.writer.path),unlink(this.journal)]);
      if(removed.some(r=>r.status==='rejected'))this.state.update({warning:'Video saved. An unused partial file could not be removed.'});
      this.state.update({result});this.state.move('done');await this.cleanup();this.emit();this.show();this.setup?.webContents.send('recording:finished',result);
      if(this.quitRequested)app.quit();
    }catch(e){await this.fail(e);throw e;}
  }
  private async cleanup() {
    if(this.clock)clearInterval(this.clock);this.clock=null;if(this.diskTimer)clearInterval(this.diskTimer);this.diskTimer=null;
    if(this.stopTimer)clearTimeout(this.stopTimer);this.stopTimer=null;
    if(this.block!==null){powerSaveBlocker.stop(this.block);this.block=null;}
    const recorder=this.recorder;this.recorder=null;recorder?.destroy();
    for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new Error('Recording ended.'));}this.pending.clear();
    await this.writer?.abort();this.writer=null;
  }
  private async fail(error:unknown) {
    if(this.state.value.state==='error')return;
    const partial=this.writer?.created?this.writer.path:undefined,journal=this.journal;
    this.state.move('error');this.state.update({error:error instanceof Error?error.message:String(error)});
    await this.cleanup();
    if(partial)try{if((await stat(partial)).size===0){await unlink(partial);await unlink(journal);}}catch{/* Keep files if cleanup is unavailable. */}
    this.emit();this.show();
  }
  private async recoveries() {
    const found=[];
    for(const name of await readdir(app.getPath('userData'))){
      if(!/^recording-[a-f0-9-]+\.json$/.test(name))continue;
      try{const j=JSON.parse(await readFile(join(app.getPath('userData'),name),'utf8'));const s=await stat(j.part);found.push({id:name.slice(10,-5),name:basename(j.part),bytes:s.size});}catch{/* Missing file or invalid journal. */}
    }return found;
  }
  private async recover(id:unknown) {
    if(this.busy || typeof id!=='string' || !/^[a-f0-9-]{36}$/.test(id))throw new Error('Invalid recovery request.');
    this.operation=true;
    try{
      const j=JSON.parse(await readFile(join(app.getPath('userData'),'recording-'+id+'.json'),'utf8'));
      if(j.id!==id || typeof j.part!=='string' || typeof j.target!=='string' || !j.target.endsWith('.webm') || j.part!==j.target+'.part')throw new Error('Invalid recording journal.');
      const disk=await statfs(dirname(j.target)),source=await stat(j.part);
      if(!canFinalize(disk.bavail*disk.bsize,source.size))throw new Error('Free more disk space before recovering this recording.');
      this.state.prepare();this.state.move('recording');this.state.move('stopping');this.state.move('finalizing');this.emit();
      const target=j.target.replace(/\.webm$/,'-recovered-'+randomUUID().slice(0,8)+'.webm');
      const data=await finalizeRecording(j.part,target,true),result={id:randomUUID(),path:target,...data,recovered:true};
      this.results.set(result.id,result);if(this.results.size>20)this.results.delete(this.results.keys().next().value!);
      await unlink(join(app.getPath('userData'),'recording-'+id+'.json'));
      this.state.update({result});this.state.move('done');this.emit();
    }catch(e){await this.fail(e);throw e;}finally{this.operation=false;}
  }
}
