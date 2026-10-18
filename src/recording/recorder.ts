import { CHUNK_LIMIT, QUEUE_LIMIT, type RecorderCommand } from '../../shared/recording-contracts';
import { recordingCrop, recordingSize } from '../../shared/recording-geometry';
type Processor = { readable: ReadableStream<VideoFrame> };
type Generator = MediaStreamTrack & { writable: WritableStream<VideoFrame> };
declare const MediaStreamTrackProcessor: new (options:{track:MediaStreamTrack;maxBufferSize:number})=>Processor;
declare const MediaStreamTrackGenerator: new (options:{kind:'video'})=>Generator;

export function bootRecorder() {
  const api=window.recording;
  let id='',recorder:MediaRecorder|null=null,streams:MediaStream[]=[],audio:AudioContext|null=null,gain:GainNode|null=null;
  let reader:ReadableStreamDefaultReader<VideoFrame>|null=null,writer:WritableStreamDefaultWriter<VideoFrame>|null=null;
  let generator:Generator|null=null,aborted=false,sequence=0,queued=0,upload=Promise.resolve(),failed=false;
  let inputFrames=0,maxGap=0,lastTimestamp:number|null=null,statsTimer:ReturnType<typeof setInterval>|null=null;
  const cleanup=()=>{
    aborted=true;void reader?.cancel().catch(()=>{});void writer?.abort().catch(()=>{});
    for(const stream of streams)stream.getTracks().forEach(t=>t.stop());streams=[];
    generator?.stop();void audio?.close().catch(()=>{});audio=null;gain=null;
    if(statsTimer)clearInterval(statsTimer);statsTimer=null;
  };
  const fail=async(error:unknown)=>{
    if(failed)return;failed=true;
    // Stop producing immediately. The main retains already acknowledged chunks for recovery.
    if(recorder && recorder.state!=='inactive')recorder.stop();
    cleanup();await api.error(id,error instanceof Error?error.message:String(error));
  };
  async function start(command:RecorderCommand) {
    if(recorder)throw new Error('Recorder already started.');
    id=command.id;const config=command.config!,source=command.source!;
    const audioTracks:MediaStreamTrack[]=[];
    // Resolve device/permission setup before opening the video track so its first
    // queued frame cannot predate recording by the microphone startup delay.
    if(config.mic){
      const mic=await navigator.mediaDevices.getUserMedia({audio:{deviceId:config.micId?{exact:config.micId}:undefined,echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
      streams.push(mic);audio=new AudioContext();await audio.resume();
      gain=audio.createGain();const destination=audio.createMediaStreamDestination();
      audio.createMediaStreamSource(mic).connect(gain);gain.connect(destination);audioTracks.push(...destination.stream.getAudioTracks());streams.push(destination.stream);
      mic.getAudioTracks()[0].addEventListener('ended',()=>{if(gain)gain.gain.value=0;if(!aborted)void api.warning(id,'Microphone disconnected. Video recording continues without voice.');});
    }
    const screen=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:{ideal:30,max:30}},audio:false});
    streams.push(screen);
    const input=screen.getVideoTracks()[0];
    input.addEventListener('ended',()=>{if(!aborted)void fail(new Error('Screen source ended.'));});
    const settings=input.getSettings(),width=settings.width!,height=settings.height!;
    if(!width || !height)throw new Error('Screen dimensions are unavailable.');
    const crop=config.mode==='region'?recordingCrop(config.region!,source.bounds,width,height):{x:0,y:0,width,height};
    const output=recordingSize(crop.width,crop.height);
    let video=input,pump:(()=>Promise<void>)|null=null,forwardFrames=false;
    {
      if(typeof MediaStreamTrackProcessor!=='function' || typeof MediaStreamTrackGenerator!=='function')throw new Error('This Electron runtime does not support region recording.');
      reader=new MediaStreamTrackProcessor({track:input,maxBufferSize:2}).readable.getReader();
      generator=new MediaStreamTrackGenerator({kind:'video'});writer=generator.writable.getWriter();video=generator;
      pump=async()=>{
        let frameSize='';
        try{
          while(!aborted){
            await writer!.ready;
            const {value:frame,done}=await reader!.read();if(done)break;
            let cropped:VideoFrame|undefined;
            try{
              if(!forwardFrames)continue;
              inputFrames++;
              if(lastTimestamp!==null)maxGap=Math.max(maxGap,(frame.timestamp-lastTimestamp)/1000);
              lastTimestamp=frame.timestamp;
              const visible=frame.visibleRect!;
              const currentSize=frame.displayWidth+'x'+frame.displayHeight;
              if(frameSize && frameSize!==currentSize)throw new Error('Screen resolution changed.');
              frameSize=currentSize;
              const area=config.mode==='region'?recordingCrop(config.region!,source.bounds,visible.width,visible.height):{x:0,y:0,width:visible.width,height:visible.height};
              const size=recordingSize(area.width,area.height);
              cropped=new VideoFrame(frame,{visibleRect:{...area,x:visible.x+area.x,y:visible.y+area.y},displayWidth:size.width,displayHeight:size.height});
              await writer!.write(cropped);
            }finally{cropped?.close();frame.close();}
          }
        }catch(e){if(!aborted)await fail(e);}
      };
      void pump();
      // Warm the desktop capture source without retaining its initial frames.
      // Windows capture can briefly stall while switching to its steady-state backend.
      await new Promise(resolve=>setTimeout(resolve,1000));
      if(failed)throw new Error('Screen capture could not be initialized.');
    }
    const tracks:MediaStreamTrack[]=[video,...audioTracks];
    for(const mimeType of ['video/webm;codecs=vp8'+(config.mic?',opus':''),'video/webm;codecs=vp9'+(config.mic?',opus':'')]) {
      if(!MediaRecorder.isTypeSupported(mimeType))continue;
      try{recorder=new MediaRecorder(new MediaStream(tracks),{mimeType,videoBitsPerSecond:Math.max(1000000,Math.round(6000000*output.width*output.height/(1920*1080))),audioBitsPerSecond:128000});break;}catch{/* Try the next supported WebM encoder. */}
    }
    if(!recorder)throw new Error('No supported WebM encoder could be initialized.');
    recorder.ondataavailable=event=>{
      if(!event.data.size || failed)return;
      queued+=event.data.size;
      if(queued>QUEUE_LIMIT){void fail(new Error('Recording disk cannot keep up. Partial file was kept.'));return;}
      upload=upload.then(async()=>{
        for(let offset=0;offset<event.data.size;offset+=CHUNK_LIMIT){
          if(failed)return;
          const bytes=await event.data.slice(offset,offset+CHUNK_LIMIT).arrayBuffer();
          const result=await api.chunk(id,sequence++,bytes);if(!result.ok)throw new Error(result.error);
        }
      }).finally(()=>{queued-=event.data.size;});
      void upload.catch(fail);
    };
    recorder.onerror=()=>void fail(new Error('WebM encoder failed.'));
    recorder.onstop=()=>{void upload.then(async()=>{cleanup();if(!failed){const result=await api.end(id,sequence-1);if(!result.ok)throw new Error(result.error);}}).catch(fail);};
    await new Promise<void>((resolve,reject)=>{
      recorder!.onstart=()=>resolve();
      recorder!.addEventListener('error',()=>reject(new Error('Encoder failed to start.')),{once:true});
      recorder!.start(1000);
      forwardFrames=true;
    });
    inputFrames=0;maxGap=0;lastTimestamp=null;
    if(generator)statsTimer=setInterval(()=>void api.reportFrames(id,inputFrames,maxGap),1000);
  }
  const unsubscribe=api.onCommand(command=>{
    void (async()=>{
      try {
        if(command.action==='start')await start(command);
        else {
          if(command.id!==id || !recorder)throw new Error('Stale recorder command.');
          if(command.action==='pause' || command.action==='resume'){
            const event=command.action==='pause'?'pause':'resume';
            await new Promise<void>(resolve=>{recorder!.addEventListener(event,()=>resolve(),{once:true});if(event==='pause')recorder!.pause();else recorder!.resume();});
          }
          if(command.action==='mute' && gain)gain.gain.value=command.muted?0:1;
          if(command.action==='stop')recorder.stop();
        }
        await api.ack({id:command.id,requestId:command.requestId});
      }catch(e){cleanup();await api.ack({id:command.id,requestId:command.requestId,error:e instanceof Error?e.message:String(e)});}
    })();
  });
  void api.ready();
  window.addEventListener('beforeunload',()=>{unsubscribe();cleanup();},{once:true});
}
