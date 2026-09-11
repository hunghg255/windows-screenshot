import { useEffect, useRef, useState } from 'react';
import type { CaptureData, Rect } from '../../shared/contracts';
export function SelectionOverlay({ capture }: { capture: CaptureData }) {
  const dragging = useRef(false);
  const [rect, setRect] = useState<Rect | null>(null), [error, setError] = useState('');
  useEffect(() => {
    const unsubscribe = window.screenshot.onSelection(setRect);
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') void window.screenshot.cancel(capture.id); };
    window.addEventListener('keydown', handler);
    return () => { unsubscribe(); window.removeEventListener('keydown', handler); };
  }, [capture.id]);
  async function selection(phase: 'start' | 'end' | 'reset') {
    const result = await window.screenshot.selection(capture.id, phase);
    if (!result.ok) { setError(result.error); dragging.current = false; }
  }
  const b = capture.overlayBounds!;
  return <div className="selection" onPointerDown={e => {
    if (e.button !== 0 || dragging.current) return;
    dragging.current = true; setError(''); e.currentTarget.setPointerCapture(e.pointerId); void selection('start');
  }} onPointerUp={() => { if (dragging.current) { dragging.current = false; void selection('end'); } }} onPointerCancel={() => {
    if (dragging.current) { dragging.current = false; void selection('reset'); }
  }} onLostPointerCapture={() => { if (dragging.current) { dragging.current = false; void selection('reset'); } }}>
    <img src={capture.image} draggable={false} alt="Frozen screen capture" />
    <div className="selection-box" style={rect ? { left: `${(rect.x - b.x) / b.width * 100}%`, top: `${(rect.y - b.y) / b.height * 100}%`, width: `${rect.width / b.width * 100}%`, height: `${rect.height / b.height * 100}%` } : { inset: 0, background: '#0005' }} />
    <div className="selection-hint">{error || (rect ? 'Release to capture · Esc to cancel' : 'Drag to select an area across screens · Esc to cancel')}</div>
  </div>;
}
