import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { CaptureData } from '../../shared/contracts';
import { pixelPoint } from '../../shared/geometry';
import { useEditor } from '../stores/editor';
import { nonEmpty, shapeEnd, type Annotation, type Drawing, type TextAnnotation, type Tool } from './model';
import { hitTest } from './hit-test';
import { annotationBounds, Renderer } from './render';
import { Toolbar } from './Toolbar';
import { TextComposer } from './TextComposer';
import { EmojiPicker } from './EmojiPicker';
import { loadGlyphFonts, textError } from './glyph-layout';
import { availableEmojis } from './emojis';
import { SelectionHandles } from './SelectionHandles';
import { moveAnnotation, resizeAnnotation, type Handle, type Box } from './transform';
export function Editor({ capture }: { capture: CaptureData }) {
  const canvas = useRef<HTMLCanvasElement>(null), area = useRef<HTMLDivElement>(null), renderer = useRef<Renderer | null>(null), draft = useRef<Drawing | null>(null);
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [revision, setRevision] = useState(0);
  const s = useEditor();
  const [editing, setEditing] = useState<TextAnnotation | null>(null);
  const [picker, setPicker] = useState(false), [pendingEmoji, setPendingEmoji] = useState<string | null>(null);
  const [emojiOptions, setEmojiOptions] = useState<ReturnType<typeof availableEmojis>>([]);
  const drag = useRef<{ original: Annotation; preview: Annotation; bounds: Box; handle: Handle | 'move'; clientX: number; clientY: number; ratio: number; pointerId: number; moved: boolean } | null>(null);
  const selected = drag.current?.preview ?? s.annotations.find(a => a.id === s.selectedId);
  function endDrag(commit: boolean) {
    const current = drag.current; if (!current) return; drag.current = null;
    if (commit && current.moved) useEditor.getState().replace(current.preview);
    if (canvas.current?.hasPointerCapture(current.pointerId)) canvas.current.releasePointerCapture(current.pointerId);
    setRevision(v => v + 1);
  }
  function beginDrag(e: PointerEvent<HTMLElement>, handle: Handle | 'move', annotation = selected) {
    if (!annotation || busy || editing || picker || e.button !== 0 || drag.current) return;
    e.preventDefault(); canvas.current?.focus();
    drag.current = { original: annotation, preview: annotation, bounds: annotationBounds(annotation, 0), handle, clientX: e.clientX, clientY: e.clientY, ratio: capture.width / canvas.current!.getBoundingClientRect().width, pointerId: e.pointerId, moved: false };
    canvas.current!.setPointerCapture(e.pointerId); setRevision(v => v + 1);
  }
  useEffect(() => {
    const move = (e: globalThis.PointerEvent) => {
      const d = drag.current; if (!d || e.pointerId !== d.pointerId) return;
      if (!d.moved && Math.hypot(e.clientX - d.clientX, e.clientY - d.clientY) < 3) return;
      d.moved = true; const delta = { x: (e.clientX - d.clientX) * d.ratio, y: (e.clientY - d.clientY) * d.ratio };
      d.preview = d.handle === 'move' ? moveAnnotation(d.original, d.bounds, delta, capture) : resizeAnnotation(d.original, d.bounds, d.handle, delta, e.shiftKey, capture);
      setRevision(v => v + 1);
    };
    const up = (e: globalThis.PointerEvent) => { if (drag.current?.pointerId === e.pointerId) { move(e); endDrag(true); } };
    const abort = () => endDrag(false);
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', abort); window.addEventListener('lostpointercapture', abort); window.addEventListener('blur', abort);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', abort); window.removeEventListener('lostpointercapture', abort); window.removeEventListener('blur', abort); };
  }, [capture.width, capture.height]);
  useEffect(() => {
    useEditor.getState().reset(); let disposed = false; const img = new Image();
    img.onload = () => { void loadGlyphFonts().then(() => { if (!disposed) { renderer.current = new Renderer(img); setEmojiOptions(availableEmojis()); setReady(true); } }).catch(() => { if (!disposed) setMessage('Could not load annotation fonts. Please reopen this capture.'); }); };
    img.onerror = () => setMessage('Could not open the captured image.'); img.src = capture.image;
    return () => { disposed = true; renderer.current?.dispose(); renderer.current = null; useEditor.getState().reset(); };
  }, [capture.id, capture.image]);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => { endDrag(false); const scale = Math.min(1, (entry.contentRect.width - 56) / capture.width, (entry.contentRect.height - 56) / capture.height); if (canvas.current) { canvas.current.style.width = `${Math.max(1, capture.width * scale)}px`; canvas.current.style.height = `${Math.max(1, capture.height * scale)}px`; } });
    observer.observe(area.current!); return () => observer.disconnect();
  }, [capture.width, capture.height]);
  useEffect(() => {
    if (!ready || !canvas.current) return;
    const frame = requestAnimationFrame(() => {
      let all = draft.current ? [...s.annotations, draft.current] : s.annotations;
      if (drag.current) { const preview = drag.current.preview; all = all.map(a => a.id === preview.id ? preview : a); }
      if (editing) all = [...all.filter(a => a.id !== editing.id), ...(textError(editing.content) ? [] : [editing])];
      renderer.current?.render(canvas.current!, all);
    }); return () => cancelAnimationFrame(frame);
  }, [s.annotations, s.selectedId, ready, revision, editing, capture.width]);
  async function cancel() { const r = await window.screenshot.cancel(capture.id); if (!r.ok) setMessage(r.error); }
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (drag.current) { if (e.key === 'Escape') { e.preventDefault(); endDrag(false); } return; } if (busy || e.isComposing) return; if (e.key === 'Escape') { if (editing) setEditing(null); else if (picker || pendingEmoji) { setPicker(false); setPendingEmoji(null); s.setTool('select'); } else if (draft.current) { draft.current = null; setRevision(v => v + 1); } else void cancel(); }
      if (editing || picker) return;
      if (e.key === 'Delete' && !(e.target instanceof HTMLElement && (e.target.closest('input,textarea,select,[contenteditable=true]')))) useEditor.getState().remove(); };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [busy, capture.id, editing, picker, pendingEmoji]);
  function chooseTool(tool: Tool) { setPendingEmoji(null); s.setTool(tool); setPicker(tool === 'emoji'); }
  function closePanel() { setPicker(false); setPendingEmoji(null); s.setTool('select'); requestAnimationFrame(() => canvas.current?.focus()); }
  function finishText() {
    if (!editing || textError(editing.content)) return;
    if (nonEmpty(editing)) { if (s.annotations.some(a => a.id === editing.id)) s.replace(editing); else s.add(editing); s.setTool('select'); s.select(editing.id); }
    setEditing(null); requestAnimationFrame(() => canvas.current?.focus());
  }
  function point(e: PointerEvent<HTMLCanvasElement>) { const b = e.currentTarget.getBoundingClientRect(); return pixelPoint({ x: e.clientX, y: e.clientY }, { x: b.left, y: b.top, width: b.width, height: b.height }, capture); }
  function update(e: PointerEvent<HTMLCanvasElement>) {
    if (!draft.current) return; const p = point(e), a = draft.current;
    draft.current = 'points' in a ? { ...a, points: [...a.points, p] } : { ...a, end: shapeEnd(a.start, p, a.type === 'circle' || (a.type === 'rectangle' && e.shiftKey), capture) }; setRevision(v => v + 1);
  }
  async function output(action: 'copy' | 'save') {
    if (!renderer.current || busy || editing || picker || drag.current) return; setBusy(true); setMessage('');
    try { const r = await window.screenshot.output(capture.id, action, renderer.current.export(useEditor.getState().annotations)); setMessage(r.ok ? r.value === 'cancelled' ? 'Save cancelled. Your image is still here.' : r.value === 'saved' ? 'PNG saved.' : 'Image copied to clipboard.' : r.error); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Export failed. Please try again.'); } finally { setBusy(false); }
  }
  return <main className="editor"><Toolbar busy={busy || !!editing || picker || !!drag.current} ready={ready} chooseTool={chooseTool} output={action => void output(action)} cancel={() => void cancel()} /><div ref={area} className="canvas-area"><div className="canvas-stage"><canvas ref={canvas} tabIndex={0} width={capture.width} height={capture.height} aria-label="Screenshot annotation canvas" style={{ cursor: s.tool === 'select' ? 'default' : s.tool === 'text' ? 'text' : 'crosshair' }} onDoubleClick={e => {
    if (s.tool !== 'select' || editing || picker || busy) return; const b = e.currentTarget.getBoundingClientRect();
    const id = hitTest(s.annotations, pixelPoint({ x: e.clientX, y: e.clientY }, { x: b.left, y: b.top, width: b.width, height: b.height }, capture), 5 * capture.width / b.width);
    const a = s.annotations.find(a => a.id === id); if (a?.type === 'text') setEditing({ ...a });
  }} onPointerDown={e => {
    if (!ready || busy || editing || picker || e.button !== 0) return; const p = point(e); e.currentTarget.focus();
    if (s.tool === 'select') { const id = hitTest(s.annotations, p, 5 * capture.width / e.currentTarget.getBoundingClientRect().width); s.select(id); const a = s.annotations.find(a => a.id === id); if (a) beginDrag(e, 'move', a); return; }
    if (s.tool === 'text') { s.select(null); setEditing({ id: crypto.randomUUID(), type: 'text', content: '', position: p, color: s.color, fontFamily: 'Segoe UI', fontSize: s.textSize, lineHeight: 1.25 }); return; }
    if (s.tool === 'emoji') { if (pendingEmoji) { const id = crypto.randomUUID(); s.add({ id, type: 'emoji', content: pendingEmoji, position: p, size: s.emojiSize }); setPendingEmoji(null); s.setTool('select'); s.select(id); } else setPicker(true); return; }
    e.currentTarget.setPointerCapture(e.pointerId);
    s.select(null); const base = { id: crypto.randomUUID(), width: s.tool === 'blurStroke' ? s.blurWidth : s.width };
    draft.current = s.tool === 'blurStroke' ? { ...base, type: 'blurStroke', points: [p] } : s.tool === 'freehand' ? { ...base, type: 'freehand', color: s.color, points: [p] } : { ...base, type: s.tool, color: s.color, start: p, end: p }; setRevision(v => v + 1);
  }} onPointerMove={e => { if (!busy && !drag.current) update(e); }} onPointerUp={e => { if (drag.current) return; update(e); if (draft.current && nonEmpty(draft.current)) s.add(draft.current); draft.current = null; if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); setRevision(v => v + 1); }} onPointerCancel={() => { draft.current = null; setRevision(v => v + 1); }} />{selected && !editing && !picker && <SelectionHandles bounds={annotationBounds(selected, 0)} width={capture.width} height={capture.height} start={beginDrag} edit={() => { if (!drag.current && selected.type === 'text') setEditing({ ...selected }); }} />}</div></div>{editing && <TextComposer value={editing} change={setEditing} done={finishText} cancel={() => { setEditing(null); requestAnimationFrame(() => canvas.current?.focus()); }} />}{picker && <EmojiPicker options={emojiOptions} choose={emoji => { setPendingEmoji(emoji); setPicker(false); canvas.current?.focus(); }} cancel={closePanel} />}<footer><span>{capture.width} × {capture.height} px · Original resolution</span><span role="status">{pendingEmoji ? 'Click the image to place the emoji · Esc to discard' : message || 'Shift: square · Double-click text: edit · Delete: remove · Esc: cancel'}</span></footer></main>;
}


