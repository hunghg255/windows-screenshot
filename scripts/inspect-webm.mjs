import { open } from 'node:fs/promises';
const file=await open(process.argv[2],'r'),total=(await file.stat()).size;
function vint(b,p=0,id=false){let w=1;while(w<8&&!(b[p]&(128>>(w-1))))w++;let n=BigInt(id?b[p]:b[p]&((128>>(w-1))-1));for(let i=1;i<w;i++)n=n*256n+BigInt(b[p+i]);return {w,n:n===(1n<<BigInt(w*7))-1n&&!id?-1:Number(n)};}
async function header(p){const b=Buffer.alloc(16);await file.read(b,0,16,p);const id=vint(b,0,true),size=vint(b,id.w);return {id:id.n,body:p+id.w+size.w,end:size.n<0?total:p+id.w+size.w+size.n};}
let p=0,time=0;const ids={},tracks={};
try{
  while(p<total){
    const h=await header(p);ids[h.id.toString(16)]=(ids[h.id.toString(16)]??0)+1;
    if([0x18538067,0x1f43b675,0xa0].includes(h.id)){p=h.body;continue;}
    if(h.id===0xe7){const b=Buffer.alloc(h.end-h.body);await file.read(b,0,b.length,h.body);time=Number(BigInt('0x'+b.toString('hex')));}
    if(h.id===0xa3||h.id===0xa1){
      const b=Buffer.alloc(16);await file.read(b,0,16,h.body);const t=vint(b),ts=time+b.readInt16BE(t.w);
      const row=tracks[t.n]??{count:0,last:0,maxGap:0,first:ts,keyframes:0,firstTimestamps:[],largeGaps:[]};row.count++;
      const gap=ts-row.last;if(row.count<=20)row.firstTimestamps.push(ts);if(gap>200&&row.largeGaps.length<10)row.largeGaps.push({frame:row.count,time:ts,gap});
      row.maxGap=Math.max(row.maxGap,gap);row.last=ts;if(b[t.w+2]&128)row.keyframes++;tracks[t.n]=row;
    }
    if(h.end<=p)throw new Error('Invalid element');p=h.end;
  }
  console.log(JSON.stringify({total,ids,tracks},null,2));
}finally{await file.close();}
