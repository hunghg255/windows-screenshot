import { describe,expect,it } from 'vitest';
import { RecordingSession } from '../electron/recording/session';
describe('recording session',()=>{
  it('counts active time and ignores pause',()=>{
    let now=0;const s=new RecordingSession(()=>now);s.prepare();s.move('countdown');s.move('recording');
    now=1000;s.move('paused');now=5000;expect(s.snapshot().elapsedMs).toBe(1000);
    s.move('recording');now=5500;s.move('stopping');expect(s.snapshot().elapsedMs).toBe(1500);
    s.move('finalizing');s.move('done');expect(s.busy).toBe(false);
  });
  it('rejects invalid transitions and concurrent prepare',()=>{
    const s=new RecordingSession();expect(()=>s.move('paused')).toThrow();
    s.prepare();s.move('recording');expect(()=>s.prepare()).toThrow();s.move('error');s.move('idle');
    expect(s.value.revision).toBeGreaterThan(0);
  });
});
