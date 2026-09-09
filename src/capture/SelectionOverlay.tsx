import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { CaptureData, Point } from '../../shared/contracts';
import { pixelPoint, region } from '../../shared/geometry';
export function SelectionOverlay({ capture }: { capture: CaptureData }) {
  const start = useRef<Point | null>(null); const [end, setEnd] = useState<Point | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') void window.screenshot.cancel(capture.id); }; window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler); }, [capture.id]);
  const point = (e: PointerEvent<HTMLDivElement>) => pixelPoint({ x: e.clientX, y: e.clientY }, { x: 0, y: 0, width: innerWidth, height: innerHeight }, capture);
  const rect = start.current && end ? region(start.current, end, capture) : null;
  return <div className="selection" onPointerDown={e => { if (busy || e.button !== 0) return; e.currentTarget.setPointerCapture(e.pointerId); start.current = point(e); setEnd(start.current); }} onPointerMove={e => { if (start.current && !busy) setEnd(point(e)); }} onPointerCancel={() => { start.current = null; setEnd(null); }} onPointerUp={async e => {
    if (!start.current || busy) return; const selected = region(start.current, point(e), capture); start.current = null;
    if (!selected.width || !selected.height) { setEnd(null); return; } setBusy(true);
    const result = await window.screenshot.crop(capture.id, selected); if (!result.ok) { setError(result.error); setBusy(false); setEnd(null); }
  }}><img src={capture.image} draggable={false} alt="Frozen screen capture" /><div className="selection-box" style={rect ? { left: `${rect.x / capture.width * 100}%`, top: `${rect.y / capture.height * 100}%`, width: `${rect.width / capture.width * 100}%`, height: `${rect.height / capture.height * 100}%` } : { inset: 0, background: '#0005' }} /><div className="selection-hint">{error || (rect ? `${rect.width} × ${rect.height} px · Release to capture` : 'Drag to select an area · Esc to cancel')}</div></div>;
}
