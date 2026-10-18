import { createWriteStream, type WriteStream } from 'node:fs';
import { once } from 'node:events';
import { CHUNK_LIMIT, QUEUE_LIMIT } from '../../shared/recording-contracts';
export class RecordingWriter {
  private stream: WriteStream | null = null;
  private tail: Promise<void> = Promise.resolve();
  private accepted = 0;
  private queued = 0;
  private failure: Error | null = null;
  private closing = false;
  bytes = 0;
  created = false;
  constructor(readonly path: string) {}
  async create() {
    this.stream=createWriteStream(this.path,{flags:'wx',highWaterMark:1024*1024,flush:true});
    this.stream.on('error',error=>{this.failure=error;});
    await once(this.stream,'open');this.created=true;
  }
  append(sequence: number, data: Uint8Array): Promise<void> {
    if (!this.stream || !this.created || this.closing || this.failure) return Promise.reject(this.failure ?? new Error('Recording file is closed.'));
    if (!Number.isSafeInteger(sequence) || sequence !== this.accepted || data.byteLength === 0 || data.byteLength > CHUNK_LIMIT || this.queued + data.byteLength > QUEUE_LIMIT) return Promise.reject(new Error('Invalid chunk sequence or recording queue overflow.'));
    this.accepted++; this.queued += data.byteLength;
    const write = this.tail.then(async () => {
      if (this.failure) throw this.failure;
      await new Promise<void>((resolve,reject)=>{
        const stream=this.stream!;let flushed=false,ready=false;
        const done=()=>{if(flushed && ready){stream.removeListener('drain',drain);resolve();}};
        const drain=()=>{ready=true;done();};
        stream.once('drain',drain);
        ready=stream.write(data,error=>{
          if(error){stream.removeListener('drain',drain);reject(error);return;}
          this.bytes+=data.byteLength;flushed=true;done();
        });
        done();
      });
    }).catch(e => { this.failure = e instanceof Error ? e : new Error(String(e)); throw this.failure; })
      .finally(() => { this.queued -= data.byteLength; });
    this.tail=write.catch(() => {});
    return write;
  }
  async finish(lastSequence: number) {
    this.closing = true;
    await this.tail;
    if (this.failure) throw this.failure;
    if (lastSequence !== this.accepted-1 || this.bytes === 0) throw new Error('Recording ended before all chunks arrived.');
    const closed=once(this.stream!,'close');
    this.stream!.end();await closed;this.stream=null;
  }
  async abort() {
    this.closing=true;await this.tail;
    if(this.stream && !this.stream.closed){
      const stream=this.stream;
      await new Promise<void>(resolve=>{stream.once('close',resolve);stream.destroy();});
    }
    this.stream=null;
  }
}
