import type { PointerEvent } from 'react';
import { rotatedSize, scenePoint, type QuarterTurns } from './screenshot-rotation';
import { handles, normalizeAngle, type Box, type DragHandle, type Handle } from './transform';
function resizeCursor(handle: Handle, rotation: number) {
  const angle = { e: 0, se: 45, s: 90, sw: 135, w: 180, nw: 225, n: 270, ne: 315 }[handle] + rotation * 180 / Math.PI;
  return `${['ew', 'nwse', 'ns', 'nesw'][Math.round(angle / 45) % 4]}-resize`;
}
export function SelectionHandles({ bounds, quarterTurns = 0, rotation: localRotation, rotatable, width, height, start, edit }: { bounds: Box; quarterTurns?: QuarterTurns; rotation: number; rotatable: boolean; width: number; height: number; start(e: PointerEvent<HTMLElement>, handle: DragHandle): void; edit(): void }) {
  const size = rotatedSize({ width, height }, quarterTurns);
  const center = scenePoint({ x: (bounds.x + bounds.right) / 2, y: (bounds.y + bounds.bottom) / 2 }, { width, height }, quarterTurns);
  const w = bounds.right - bounds.x, h = bounds.bottom - bounds.y;
  const b = { x: center.x - w / 2, y: center.y - h / 2, right: center.x + w / 2, bottom: center.y + h / 2 };
  width = size.width; height = size.height;
  const rotation = localRotation + quarterTurns * Math.PI / 2;
  const degrees = Math.round(normalizeAngle(localRotation) * 180 / Math.PI) % 360;
  return <div className="annotation-selection" aria-label="Selected object" data-rotation={degrees} style={{ left: `${b.x / width * 100}%`, top: `${b.y / height * 100}%`, width: `${(b.right - b.x) / width * 100}%`, height: `${(b.bottom - b.y) / height * 100}%`, transform: `rotate(${rotation}rad)` }} onPointerDown={e => start(e, 'move')} onDoubleClick={edit}>
    {handles.map(handle => <button key={handle} type="button" className="resize-handle" aria-label={`Resize ${handle}`} style={{ left: handle.includes('w') ? '0%' : handle.includes('e') ? '100%' : '50%', top: handle.includes('n') ? '0%' : handle.includes('s') ? '100%' : '50%', cursor: resizeCursor(handle, rotation) }} onDoubleClick={e => e.stopPropagation()} onPointerDown={e => { e.stopPropagation(); start(e, handle); }} />)}
    {rotatable && <><span className="rotation-stem" aria-hidden="true" /><button type="button" className="rotation-handle" aria-label="Rotate selected object" title={`Rotate ${degrees}° · Shift: snap 15°`} onDoubleClick={e => e.stopPropagation()} onPointerDown={e => { e.stopPropagation(); start(e, 'rotate'); }}><span aria-hidden="true">↻</span></button><span className="rotation-angle" aria-hidden="true" style={{ transform: `translate(-50%, -50%) rotate(${-rotation}rad)` }}>{degrees}°</span></>}
  </div>;
}
