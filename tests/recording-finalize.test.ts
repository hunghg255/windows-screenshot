import { afterEach,expect,it } from 'vitest';
import { mkdtemp,readFile,writeFile,rm,stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { finalizeRecording } from '../electron/recording/finalize';
const dirs:string[]=[];
afterEach(async()=>{for(const d of dirs.splice(0))await rm(d,{recursive:true,force:true});});
function element(hex:string,body:Buffer){if(body.length>=127)throw new Error('Fixture too large');return Buffer.concat([Buffer.from(hex,'hex'),Buffer.from([0x80|body.length]),body]);}
function fixture(){
  const ebml=element('1a45dfa3',element('4282',Buffer.from('webm')));
  const info=element('1549a966',element('2ad7b1',Buffer.from('0f4240','hex')));
  const tracks=element('1654ae6b',element('ae',Buffer.concat([element('d7',Buffer.from([1])),element('83',Buffer.from([1])),element('86',Buffer.from('V_VP8'))])));
  const cluster=(time:number)=>element('1f43b675',Buffer.concat([element('e7',Buffer.from([time>>8,time&255])),element('a3',Buffer.from([0x81,0,0,0x80,0,1,2]))]));
  return Buffer.concat([ebml,Buffer.from('1853806701ffffffffffffff','hex'),info,tracks,cluster(0),cluster(1000)]);
}
it('creates duration and seek metadata without modifying the source',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'finalizer-'));dirs.push(dir);const input=join(dir,'in.part'),output=join(dir,'out.webm');
  const original=fixture();await writeFile(input,original);const result=await finalizeRecording(input,output);
  expect(result.durationMs).toBeCloseTo(1033.333,2);
  const data=await readFile(output);expect(data.includes(Buffer.from('1c53bb6b','hex'))).toBe(true);expect(data.includes(Buffer.from('114d9b74','hex'))).toBe(true);
  expect(await readFile(input)).toEqual(original);expect(result.bytes).toBe(data.length);
});
it('recovers only complete clusters and refuses to overwrite a result',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'finalizer-'));dirs.push(dir);const input=join(dir,'in.part'),output=join(dir,'out.webm');
  const original=fixture();await writeFile(input,original.subarray(0,original.length-3));
  await expect(finalizeRecording(input,output)).rejects.toThrow();
  await expect(stat(output+'.finalizing')).rejects.toThrow();
  const result=await finalizeRecording(input,output,true);expect(result.durationMs).toBeCloseTo(33.333,2);
  const saved=await readFile(output);await expect(finalizeRecording(input,output,true)).rejects.toThrow();expect(await readFile(output)).toEqual(saved);
});
it('rejects missing headers',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'finalizer-'));dirs.push(dir);const input=join(dir,'bad.part');await writeFile(input,Buffer.alloc(20));
  await expect(finalizeRecording(input,join(dir,'out.webm'),true)).rejects.toThrow();
});
