import { useEffect, useRef, useState } from 'react';
import { Video, FolderOpen, Mic, Square, Pause, Play } from 'lucide-react';
import { recordingDefaults, type RecordingSettings, type RecordingSource, type RecoveryItem } from '../../shared/recording-contracts';
import { useRecording } from '../stores/recording';
import { Button } from '../components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../components/ui/card';
import { Field, FieldGroup, FieldLabel, FieldDescription } from '../components/ui/field';
import { Input } from '../components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '../components/ui/toggle-group';
const api=window.recording;
function elapsed(ms:number){const s=Math.floor(ms/1000);return [Math.floor(s/3600),Math.floor(s/60)%60,s%60].map(n=>String(n).padStart(2,'0')).join(':');}
export function Setup() {
  const state=useRecording(s=>s.snapshot);
  const [config,setConfig]=useState<RecordingSettings>({...recordingDefaults});
  const [sources,setSources]=useState<RecordingSource[]>([]),[mics,setMics]=useState<MediaDeviceInfo[]>([]);
  const [message,setMessage]=useState(''),[pending,setPending]=useState(false),[recovery,setRecovery]=useState<RecoveryItem[]>([]);
  const [loaded,setLoaded]=useState(false);
  const meter=useRef<HTMLMeterElement>(null),preview=useRef<()=>void>(()=>{});
  const previewVersion=useRef(0);
  function stopPreview(){previewVersion.current++;preview.current();preview.current=()=>{};}
  const busy=!loaded || !!state && ['countdown','recording','paused','stopping','finalizing'].includes(state.state);
  const selectedSource=sources.find(s=>s.id===config.sourceId);
  useEffect(()=>{
    let active=true;
    const off=api.onState(snapshot=>{useRecording.getState().receive(snapshot);if(snapshot.region)setConfig(c=>({...c,region:snapshot.region}));});
    void Promise.all([api.getState(),api.settings(),api.sources(),api.recoveries()]).then(([s,c,screens,r])=>{
      if(!active)return;
      if(s.ok)useRecording.getState().receive(s.value);
      if(screens.ok)setSources(screens.value);else setMessage(screens.error);
      if(c.ok){const available=screens.ok && screens.value.some(s=>s.id===c.value.sourceId);setConfig({...c.value,region:available?c.value.region:null,sourceId:available?c.value.sourceId:screens.ok?screens.value[0]?.id??'':''});}
      if(r.ok)setRecovery(r.value);
      setLoaded(true);
    });
    const devices=()=>void navigator.mediaDevices.enumerateDevices().then(ds=>setMics(ds.filter(d=>d.kind==='audioinput')));
    devices();navigator.mediaDevices.addEventListener('devicechange',devices);
    const refresh=()=>{if(!useRecording.getState().snapshot || !['recording','paused','stopping','finalizing','countdown'].includes(useRecording.getState().snapshot!.state))void api.sources().then(r=>{
      if(r.ok){setSources(r.value);setConfig(c=>r.value.some(s=>s.id===c.sourceId)?c:{...c,sourceId:r.value[0]?.id??'',region:null});}
    });};
    const offSources=api.onSourcesChanged(refresh);
    window.addEventListener('focus',refresh);
    const visibility=()=>{if(document.hidden)stopPreview();};
    document.addEventListener('visibilitychange',visibility);
    return()=>{active=false;off();offSources();stopPreview();navigator.mediaDevices.removeEventListener('devicechange',devices);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',visibility);};
  },[]);
  async function action(fn:()=>Promise<{ok:boolean;error?:string}>) {
    setPending(true);setMessage('');
    try{const r=await fn();if(!r.ok)setMessage(r.error??'Recording failed.');}catch(e){setMessage(String(e));}finally{setPending(false);}
  }
  async function testMic() {
    stopPreview();const version=previewVersion.current;
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:{deviceId:config.micId?{exact:config.micId}:undefined}});
      if(version!==previewVersion.current || document.hidden){stream.getTracks().forEach(t=>t.stop());return;}
      const context=new AudioContext(),analyser=context.createAnalyser();analyser.fftSize=256;context.createMediaStreamSource(stream).connect(analyser);
      const data=new Uint8Array(analyser.fftSize);
      const timer=setInterval(()=>{analyser.getByteTimeDomainData(data);if(meter.current)meter.current.value=Math.sqrt(data.reduce((n,v)=>n+((v-128)/128)**2,0)/data.length);},100);
      preview.current=()=>{clearInterval(timer);stream.getTracks().forEach(t=>t.stop());if(context.state!=='closed')void context.close().catch(()=>{});};
      setMics((await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='audioinput'));setMessage('Microphone preview is active. It stops when recording starts.');
    }catch(e){if(version===previewVersion.current)setMessage('Microphone unavailable. Check Windows microphone privacy settings, choose another device, or turn microphone off. '+String(e));}
  }
  return <main className="recording-setup">
    <header className="flex items-center justify-between gap-4"><div><h1 className="text-2xl font-semibold">Screen recording</h1><p className="text-sm text-muted-foreground">WebM · Saved locally · Up to 1080p, 30 fps</p></div><Video aria-hidden="true"/></header>
    <Card><CardHeader><CardTitle>Capture</CardTitle><CardDescription>Choose one screen, or select an area on it.</CardDescription></CardHeader>
      <CardContent><FieldGroup>
        <Field><FieldLabel htmlFor="record-source">Screen</FieldLabel><select id="record-source" disabled={busy||pending} value={config.sourceId} onChange={e=>setConfig(c=>({...c,sourceId:e.target.value,region:null}))}>{sources.map(s=><option key={s.id} value={s.id}>{s.name} · {Math.round(s.bounds.width*s.scaleFactor)} × {Math.round(s.bounds.height*s.scaleFactor)}</option>)}</select></Field>
        {selectedSource?.thumbnail?<div className="recording-preview-frame" style={{width:Math.min(240,150*selectedSource.bounds.width/selectedSource.bounds.height),aspectRatio:`${selectedSource.bounds.width}/${selectedSource.bounds.height}`}}>
          <img className="recording-preview" src={selectedSource.thumbnail} alt="Selected screen preview" />
          {config.mode==='region' && config.region?<div className="recording-preview-region" style={{left:config.region.x/selectedSource.bounds.width*100+'%',top:config.region.y/selectedSource.bounds.height*100+'%',width:config.region.width/selectedSource.bounds.width*100+'%',height:config.region.height/selectedSource.bounds.height*100+'%'}}/>:null}
        </div>:null}
        <Field><FieldLabel>Capture area</FieldLabel><ToggleGroup type="single" value={config.mode} disabled={busy||pending} onValueChange={v=>{if(v)setConfig(c=>({...c,mode:v as 'full'|'region'}));}}><ToggleGroupItem value="full">Full screen</ToggleGroupItem><ToggleGroupItem value="region">Region</ToggleGroupItem></ToggleGroup>
          {config.mode==='region'?<Button variant="outline" disabled={busy||pending||!config.sourceId} onClick={()=>void action(()=>api.selectRegion(config.sourceId))}>{config.region?'Change selected region':'Select region'}</Button>:null}
        </Field>
        <Field orientation="horizontal"><input id="record-mic" type="checkbox" checked={config.mic} disabled={busy||pending} onChange={e=>{setConfig(c=>({...c,mic:e.target.checked}));if(!e.target.checked)stopPreview();}}/><FieldLabel htmlFor="record-mic">Record microphone</FieldLabel></Field>
        {config.mic?<Field><FieldLabel htmlFor="record-device">Microphone</FieldLabel><select id="record-device" value={config.micId} disabled={busy||pending} onChange={e=>{stopPreview();setConfig(c=>({...c,micId:e.target.value}));}}><option value="">System default</option>{mics.filter(m=>m.deviceId!=='default').map((m,i)=><option key={m.deviceId||i} value={m.deviceId}>{m.label||'Microphone '+(i+1)}</option>)}</select>
          <div className="flex items-center gap-3"><Button variant="outline" disabled={busy||pending} onClick={()=>void testMic()}><Mic/>Test microphone</Button><meter ref={meter} min={0} max={1} value={0} aria-label="Microphone level"/></div></Field>:null}
        <Field><FieldLabel>Save to</FieldLabel><div className="flex items-center gap-3"><span className="min-w-0 flex-1 truncate text-sm">{config.directory||'Choose a folder before recording'}</span><Button variant="outline" disabled={busy||pending} onClick={()=>void action(async()=>{const r=await api.chooseDirectory();if(r.ok&&r.value)setConfig(c=>({...c,directory:r.value!}));return r;})}><FolderOpen/>Choose folder</Button></div><FieldDescription>About 2.8 GB per hour at 1080p with microphone. Finalizing temporarily needs space for another copy.</FieldDescription></Field>
        <Field orientation="horizontal"><input id="record-countdown" type="checkbox" checked={config.countdown} disabled={busy||pending} onChange={e=>setConfig(c=>({...c,countdown:e.target.checked}))}/><FieldLabel htmlFor="record-countdown">3-second countdown</FieldLabel></Field>
        <div className="grid grid-cols-2 gap-3"><Field><FieldLabel htmlFor="record-stop-key">Stop shortcut</FieldLabel><Input id="record-stop-key" value={config.stopShortcut} disabled={busy||pending} onChange={e=>setConfig(c=>({...c,stopShortcut:e.target.value}))}/></Field><Field><FieldLabel htmlFor="record-pause-key">Pause shortcut</FieldLabel><Input id="record-pause-key" value={config.pauseShortcut} disabled={busy||pending} onChange={e=>setConfig(c=>({...c,pauseShortcut:e.target.value}))}/></Field></div>
      </FieldGroup></CardContent>
      <CardFooter className="flex flex-wrap gap-3">
        {!busy?<Button disabled={pending||!config.directory||!config.sourceId||(config.mode==='region'&&!config.region)} onClick={()=>{stopPreview();void action(async()=>{const saved=await api.saveSettings(config);return saved.ok?api.start(config):saved;});}}><Video/>Start recording</Button>:null}
        {state && ['recording','paused'].includes(state.state)?<><Button variant="outline" disabled={pending} onClick={()=>void action(()=>state.state==='paused'?api.resume():api.pause())}>{state.state==='paused'?<Play/>:<Pause/>}{state.state==='paused'?'Resume':'Pause'}</Button>{config.mic?<Button variant="outline" disabled={pending} onClick={()=>void action(()=>api.mute(!state.muted))}>{state.muted?'Unmute':'Mute'}</Button>:null}</>:null}
        {state && ['recording','paused','countdown'].includes(state.state)?<Button variant="outline" onClick={()=>void action(()=>api.stop())}><Square/>{state.state==='countdown'?'Cancel countdown':'Stop recording'}</Button>:null}
        {state?<span className="font-mono text-sm" aria-live="off">{state.state==='countdown'?`Starting in ${state.countdown}…`:elapsed(state.elapsedMs)} · {state.state}</span>:null}
      </CardFooter>
    </Card>
    <p role="status" className="text-sm">{message||state?.error||state?.warning||'Closing this window keeps recording active. Use the tray or shortcuts to stop.'}</p>
    {state?.result?<Card><CardHeader><CardTitle>{state.result.recovered?'Recording recovered':'Recording saved'}</CardTitle><CardDescription className="break-all">{state.result.path}</CardDescription></CardHeader><CardContent>{elapsed(state.result.durationMs)} · {(state.result.bytes/1e6).toFixed(1)} MB</CardContent><CardFooter className="gap-3"><Button onClick={()=>void action(()=>api.openFile(state.result!.id))}>Open video</Button><Button variant="outline" onClick={()=>void action(()=>api.openFolder(state.result!.id))}>Open folder</Button></CardFooter></Card>:null}
    {recovery.length?<Card><CardHeader><CardTitle>Unfinished recordings</CardTitle><CardDescription>Recover the complete portion into a new file. The original is kept.</CardDescription></CardHeader><CardContent className="flex flex-col gap-3">{recovery.map(r=><div key={r.id} className="flex items-center justify-between gap-3"><span className="truncate text-sm">{r.name} · {(r.bytes/1e6).toFixed(1)} MB</span><Button variant="outline" disabled={busy||pending} onClick={()=>void action(()=>api.recover(r.id))}>Recover</Button></div>)}</CardContent></Card>:null}
  </main>;
}
