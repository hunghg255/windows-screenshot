export const LOW_DISK_WARNING = 5_000_000_000;
export const STOP_DISK_RESERVE = 500_000_000;
export function diskStatus(free:number) {
  if(!Number.isFinite(free) || free<0)throw new Error('Available disk space could not be determined.');
  return free<STOP_DISK_RESERVE?'stop':free<LOW_DISK_WARNING?'warn':'ok';
}
export function canFinalize(free:number,bytes:number) {
  return Number.isFinite(free) && Number.isFinite(bytes) && bytes>0 && free>=bytes+100_000_000;
}
