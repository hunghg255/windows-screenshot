import { afterEach,expect,it } from 'vitest';
import { mkdtemp,readFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RecordingWriter } from '../electron/recording/file-writer';
const dirs:string[]=[];
afterEach(async()=>{for(const d of dirs.splice(0))await rm(d,{recursive:true,force:true});});
it('serializes concurrent chunks and waits for the last sequence',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'writer-'));dirs.push(dir);const w=new RecordingWriter(join(dir,'a.part'));await w.create();
  const a=w.append(0,new Uint8Array([1,2])),b=w.append(1,new Uint8Array([3,4]));
  await Promise.all([a,b]);await w.finish(1);expect([...await readFile(w.path)]).toEqual([1,2,3,4]);
  await expect(w.append(2,new Uint8Array([5]))).rejects.toThrow();
});
it('rejects duplicates, gaps, oversized chunks and truncated finish without overwriting',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'writer-'));dirs.push(dir);const w=new RecordingWriter(join(dir,'a.part'));await w.create();
  await expect(new RecordingWriter(w.path).create()).rejects.toThrow();
  await expect(w.append(1,new Uint8Array([1]))).rejects.toThrow();
  await expect(w.append(0,new Uint8Array(9*1024*1024))).rejects.toThrow();
  await w.append(0,new Uint8Array([1]));await expect(w.append(0,new Uint8Array([1]))).rejects.toThrow();
  await expect(w.finish(2)).rejects.toThrow();await w.abort();expect([...await readFile(w.path)]).toEqual([1]);
});
it('acknowledges chunks larger than the stream high-water mark only after draining',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'writer-'));dirs.push(dir);const w=new RecordingWriter(join(dir,'large.part'));await w.create();
  await w.append(0,new Uint8Array(2*1024*1024).fill(7));
  expect(w.bytes).toBe(2*1024*1024);await w.finish(0);
  const saved=await readFile(w.path);expect(saved.length).toBe(w.bytes);expect(saved[0]).toBe(7);expect(saved.at(-1)).toBe(7);
});
