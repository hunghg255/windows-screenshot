import { randomUUID } from 'node:crypto';
import type { RecordingSnapshot, RecordingState } from '../../shared/recording-contracts';
const transitions: Record<RecordingState, RecordingState[]> = {
  idle:['ready','selecting-region'], ready:['selecting-region','countdown','recording','idle'],
  'selecting-region':['ready','idle'], countdown:['recording','ready','stopping'],
  recording:['paused','stopping'], paused:['recording','stopping'], stopping:['finalizing'],
  finalizing:['done'], done:['idle','ready','selecting-region'], error:['idle','ready','selecting-region'],
};
export class RecordingSession {
  value: RecordingSnapshot = { id: '', revision: 0, state:'idle', elapsedMs:0, bytes:0, muted:false, countdown:0, error:'', warning:'', region:null, result:null };
  private started = 0;
  private elapsed = 0;
  constructor(private now = () => performance.now()) {}
  get busy() { return ['countdown','recording','paused','stopping','finalizing'].includes(this.value.state); }
  snapshot(): RecordingSnapshot { return { ...this.value, elapsedMs: this.elapsed + (this.value.state === 'recording' ? this.now() - this.started : 0) }; }
  update(patch: Partial<Omit<RecordingSnapshot,'state'|'id'|'revision'>>) { this.value = {...this.value,...patch,revision:this.value.revision+1}; }
  prepare() {
    if (this.busy) throw new Error('A recording is already active.');
    this.elapsed=0;
    this.value={id:randomUUID(),revision:this.value.revision+1,state:'ready',elapsedMs:0,bytes:0,muted:false,countdown:0,error:'',warning:'',region:this.value.region,result:null};
  }
  move(state: RecordingState) {
    if (state === this.value.state) return;
    if (state !== 'error' && !transitions[this.value.state].includes(state)) throw new Error('Invalid recording transition.');
    if (this.value.state === 'recording') this.elapsed += this.now()-this.started;
    if (state === 'recording') this.started=this.now();
    this.value={...this.value,state,revision:this.value.revision+1,elapsedMs:this.elapsed};
  }
}
