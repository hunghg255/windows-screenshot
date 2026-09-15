import { expect,it } from 'vitest';
import { diskStatus,canFinalize } from '../electron/recording/disk';
it('checks warning/stop boundaries and rejects invalid disk readings',()=>{
  expect(diskStatus(5e9)).toBe('ok');expect(diskStatus(5e9-1)).toBe('warn');
  expect(diskStatus(5e8)).toBe('warn');expect(diskStatus(5e8-1)).toBe('stop');
  expect(()=>diskStatus(NaN)).toThrow();expect(()=>diskStatus(-1)).toThrow();
});
it('reserves another full file for remux, not just 500 MB',()=>{
  expect(canFinalize(500e6,5e9)).toBe(false);
  expect(canFinalize(5.1e9,5e9)).toBe(true);
  expect(canFinalize(Infinity,5e9)).toBe(false);
});
