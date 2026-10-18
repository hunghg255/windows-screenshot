import { open, stat, statfs, unlink, link, copyFile, type FileHandle } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname } from 'node:path';
const ID = { segment:0x18538067, info:0x1549a966, tracks:0x1654ae6b, cluster:0x1f43b675, cues:0x1c53bb6b };
function vint(data: Uint8Array, at = 0, keep = false) {
  const first=data[at]; if (!first) throw new Error('Invalid WebM integer.');
  let width=1; while (width<=8 && !(first & (0x80 >> (width-1)))) width++;
  if (width>8 || at+width>data.length) throw new Error('Truncated WebM integer.');
  let value=BigInt(keep ? first : first & ((0x80 >> (width-1))-1));
  for(let i=1;i<width;i++) value=value*256n+BigInt(data[at+i]);
  const unknown=!keep && value===(1n<<BigInt(width*7))-1n;
  if (!unknown && value>BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('WebM offset exceeds supported range.');
  return {width,value:unknown?-1:Number(value)};
}
function size(value:number) {
  const b=Buffer.alloc(8); let n=BigInt(value);
  for(let i=7;i>=0;i--){b[i]=Number(n & 255n);n>>=8n;} b[0]|=1; return b;
}
function uint(n:number) { const b=Buffer.alloc(8); b.writeBigUInt64BE(BigInt(Math.round(n))); return b; }
function element(id:string, body:Buffer) { return Buffer.concat([Buffer.from(id,'hex'),size(body.length),body]); }
function num(id:string,n:number) { return element(id,uint(n)); }
function durationBody(duration:number,scale:number) {
  const b=Buffer.alloc(8);b.writeDoubleBE(duration);
  return element('1549a966',Buffer.concat([num('2ad7b1',scale),element('4489',b),element('4d80',Buffer.from('Screenshot')),element('5741',Buffer.from('Screenshot'))]));
}
function seek(id:string,offset:number) {return element('4dbb',Buffer.concat([element('53ab',Buffer.from(id,'hex')),num('53ac',offset)]));}
function seeks(info:number,tracks:number,cues:number) {return element('114d9b74',Buffer.concat([seek('1549a966',info),seek('1654ae6b',tracks),seek('1c53bb6b',cues)]));}
async function bytes(file:FileHandle,position:number,length:number) {
  const data=Buffer.alloc(length); let offset=0;
  while(offset<length){const r=await file.read(data,offset,length-offset,position+offset);if(!r.bytesRead)throw new Error('Truncated WebM file.');offset+=r.bytesRead;}
  return data;
}
async function header(file:FileHandle,at:number,end:number) {
  const b=await bytes(file,at,Math.min(12,end-at)); const id=vint(b,0,true),length=vint(b,id.width);
  const body=at+id.width+length.width;
  return {id:id.value,start:at,body,end:length.value<0?end:body+length.value,unknown:length.value<0};
}
async function copy(input:FileHandle,output:FileHandle,start:number,end:number,position:number) {
  const buf=Buffer.alloc(1024*1024);
  while(start<end) {
    const length=Math.min(buf.length,end-start);
    const r=await input.read(buf,0,length,start);if(!r.bytesRead)throw new Error('Truncated recording.');
    let n=0;while(n<r.bytesRead){const w=await output.write(buf,n,r.bytesRead-n,position+n);if(!w.bytesWritten)throw new Error('Disk write stalled.');n+=w.bytesWritten;}
    start+=n;position+=n;
  }return position;
}
// Two bounded-memory passes are avoided: clusters are copied while their keyframe cues
// are streamed into a sidecar. No frame data or growing index is retained in RAM.
export async function finalizeRecording(part:string,target:string,recovered=false):Promise<{durationMs:number;bytes:number;videoFrames:number;maxFrameGapMs:number}> {
  const input=await open(part,'r'), temp=target+'.finalizing', cuesPath=target+'.cues';
  let output:FileHandle|undefined,index:FileHandle|undefined;
  let createdOutput=false,createdIndex=false,published=false;
  try {
    const total=(await input.stat()).size;
    const ebml=await header(input,0,total);if(ebml.id!==0x1a45dfa3 || ebml.end>1024*1024)throw new Error('Missing WebM header.');
    const segment=await header(input,ebml.end,total);if(segment.id!==ID.segment)throw new Error('Missing WebM segment.');
    let at=segment.body, tracks:Buffer|undefined,scale=1000000,videoTrack=1;
    while(at<total) {
      const h=await header(input,at,total);
      if(h.id===ID.cluster)break;
      if(h.end>total || h.end-at>4*1024*1024)throw new Error('Invalid WebM metadata.');
      if(h.id===ID.tracks){
        tracks=await bytes(input,at,h.end-at);
        let p=h.body;
        while(p<h.end){
          const entry=await header(input,p,h.end);let track=0,type=0,q=entry.body;
          if(entry.end>h.end)throw new Error('Invalid track entry.');
          while(q<entry.end){
            const item=await header(input,q,entry.end);
            if(item.end>entry.end)throw new Error('Invalid track metadata.');
            if(item.id===0xd7 || item.id===0x83){
              const b=await bytes(input,item.body,item.end-item.body);
              const value=Number(BigInt('0x'+b.toString('hex')));
              if(item.id===0xd7)track=value;else type=value;
            }
            q=item.end;
          }
          if(type===1)videoTrack=track;p=entry.end;
        }
      }
      if(h.id===ID.info) {
        let p=h.body;
        while(p<h.end){const child=await header(input,p,h.end);if(child.id===0x2ad7b1){const b=await bytes(input,child.body,child.end-child.body);scale=Number(BigInt('0x'+b.toString('hex')));}p=child.end;}
      }
      at=h.end;
    }
    if(!tracks || !Number.isFinite(scale) || scale<=0)throw new Error('Missing recording tracks.');
    output=await open(temp,'wx');createdOutput=true;index=await open(cuesPath,'wx+');createdIndex=true;
    const prefix=Buffer.concat([await bytes(input,0,ebml.end),Buffer.from('1853806701ffffffffffffff','hex')]);
    const segmentStart=prefix.length, seekLength=seeks(0,0,0).length, info=durationBody(0,scale);
    let position=0;
    const initial=Buffer.concat([prefix,seeks(seekLength,seekLength+info.length,0),info,tracks]);
    await output.writeFile(initial);position=initial.length;
    let lastTime=0, clusters=0, indexLength=0,videoFrames=0,previousFrameTime:number|null=null,maxFrameGapMs=0;
    while(at<total) {
      let h;try{h=await header(input,at,total);}catch(e){if(recovered)break;throw e;}
      if(h.id!==ID.cluster){if(h.end>total)break;at=h.end;continue;}
      if(h.end>total){if(recovered)break;throw new Error('Incomplete final cluster.');}
      let p=h.body,time=0,clusterEnd=h.end, cueWritten=false;
      const clusterOffset=position-segmentStart;
      while(p<h.end) {
        let child;try{child=await header(input,p,h.end);}catch(e){if(recovered){clusterEnd=p;break;}throw e;}
        if([ID.cluster,ID.cues,ID.info,ID.tracks].includes(child.id)){clusterEnd=p;break;}
        if(child.end>total){clusterEnd=p;break;}
        if(child.id===0xe7){const b=await bytes(input,child.body,child.end-child.body);time=Number(BigInt('0x'+b.toString('hex')));}
        if(child.id===0xa3 || child.id===0xa1) {
          const b=await bytes(input,child.body,Math.min(16,child.end-child.body)),track=vint(b);
          if(b.length<track.width+3)throw new Error('Invalid media block.');
          const timestamp=time+b.readInt16BE(track.width);lastTime=Math.max(lastTime,timestamp);
          if(track.value===videoTrack){
            videoFrames++;
            if(previousFrameTime!==null)maxFrameGapMs=Math.max(maxFrameGapMs,(timestamp-previousFrameTime)*scale/1000000);
            previousFrameTime=timestamp;
          }
          if(!cueWritten && track.value===videoTrack && (b[track.width+2]&0x80)) {
            const cue=element('bb',Buffer.concat([num('b3',timestamp),element('b7',Buffer.concat([num('f7',track.value),num('f1',clusterOffset)]))]));
            await index.writeFile(cue);indexLength+=cue.length;cueWritten=true;
          }
        }
        p=child.end;
      }
      if(clusterEnd<=h.body)break;
      // A recovered truncated known-size cluster must not retain its original length.
      if(!h.unknown && clusterEnd!==h.end)break;
      position=await copy(input,output,h.start,clusterEnd,position);clusters++;at=clusterEnd;
    }
    if(!clusters)throw new Error('No complete video clusters can be recovered.');
    const cuesOffset=position-segmentStart;
    const cueHeader=Buffer.concat([Buffer.from('1c53bb6b','hex'),size(indexLength)]);
    await output.write(cueHeader,0,cueHeader.length,position);position+=cueHeader.length;
    await index.sync();position=await copy(index,output,0,indexLength,position);
    const durationMs=lastTime*scale/1000000+1000/30;
    const replacement=Buffer.concat([seeks(seekLength,seekLength+info.length,cuesOffset),durationBody(durationMs*1000000/scale,scale)]);
    await output.write(replacement,0,replacement.length,segmentStart);
    await output.sync();await output.close();output=undefined;await index.close();index=undefined;
    // Same-volume hard link publishes without replacing an existing output.
    try {await link(temp,target);}
    catch(error){
      if(!['ENOTSUP','EPERM','EXDEV','ENOSYS','EINVAL'].includes((error as NodeJS.ErrnoException).code??''))throw error;
      const disk=await statfs(dirname(target));
      if(disk.bavail*disk.bsize<position+100_000_000)throw new Error('This filesystem needs extra space to publish the video. Free space and recover the partial recording.');
      await copyFile(temp,target,constants.COPYFILE_EXCL);
    }
    published=true;await unlink(temp);await unlink(cuesPath);
    return {durationMs,bytes:(await stat(target)).size,videoFrames,maxFrameGapMs};
  } finally {
    await input.close();await output?.close();await index?.close();
    if(!published){if(createdOutput)await unlink(temp).catch(()=>{});if(createdIndex)await unlink(cuesPath).catch(()=>{});}
  }
}
