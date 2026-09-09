import type { PointerEvent } from 'react';
import { handles, type Box, type Handle } from './transform';
export function SelectionHandles({ bounds: b, width, height, start, edit }: { bounds: Box; width: number; height: number; start(e: PointerEvent<HTMLElement>, handle: Handle | 'move'): void; edit(): void }) {
  return <div className="annotation-selection" aria-label="Selected object" style={{ left: `${b.x / width * 100}%`, top: `${b.y / height * 100}%`, width: `${(b.right - b.x) / width * 100}%`, height: `${(b.bottom - b.y) / height * 100}%` }} onPointerDown={e => start(e, 'move')} onDoubleClick={edit}>
    {handles.map(handle => <button key={handle} type="button" className="resize-handle" aria-label={`Resize ${handle}`} style={{ left: handle.includes('w') ? '0%' : handle.includes('e') ? '100%' : '50%', top: handle.includes('n') ? '0%' : handle.includes('s') ? '100%' : '50%', cursor: `${handle === 'nw' || handle === 'se' ? 'nwse' : handle === 'ne' || handle === 'sw' ? 'nesw' : handle === 'n' || handle === 's' ? 'ns' : 'ew'}-resize` }} onDoubleClick={e => e.stopPropagation()} onPointerDown={e => { e.stopPropagation(); start(e, handle); }} />)}
  </div>;
}
