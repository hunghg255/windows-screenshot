import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { CaptureData, Point } from '../../shared/contracts';
import { useShallow } from 'zustand/react/shallow';
import { rotatedSize, sourcePoint, sourceVector } from './screenshot-rotation';
import { pixelPoint } from '../../shared/geometry';
import { useEditor } from '../stores/editor';
import { nonEmpty, shapeEnd, type Annotation, type Drawing, type TextAnnotation, type Tool } from './model';
import { hitTest } from './hit-test';
import { annotationBounds, Renderer } from './render';
import { ImageAssets } from './image-assets';
import { setImageSize } from './image-size';
import { Toolbar } from './Toolbar';
import { TextComposer } from './TextComposer';
import { EmojiPicker } from './EmojiPicker';
import { loadGlyphFonts, textError } from './glyph-layout';
import { availableEmojis } from './emojis';
import { SelectionHandles } from './SelectionHandles';
import { boxCenter, canRotate, frameBounds, moveAnnotation, preserveGlyphOrigin, resizeAnnotation, rotationFromPointer, rotationOf, type DragHandle, type Box } from './transform';
export function Editor({ capture }: { capture: CaptureData }) {
  const canvas = useRef<HTMLCanvasElement>(null), area = useRef<HTMLDivElement>(null), renderer = useRef<Renderer | null>(null), draft = useRef<Drawing | null>(null);
  const assets = useRef(new ImageAssets()), importing = useRef(false), sessionId = useRef<string | null>(capture.id);
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [revision, setRevision] = useState(0);
  const s = useEditor(useShallow(state => ({ quarterTurns: state.quarterTurns, annotations: state.annotations, selectedId: state.selectedId, tool: state.tool, color: state.color, width: state.width, blurWidth: state.blurWidth, textSize: state.textSize, emojiSize: state.emojiSize, setTool: state.setTool, select: state.select, add: state.add, replace: state.replace })));
  const display = rotatedSize(capture, s.quarterTurns);
  const [editing, setEditing] = useState<TextAnnotation | null>(null);
  const [picker, setPicker] = useState(false), [pendingEmoji, setPendingEmoji] = useState<string | null>(null);
  const [emojiOptions, setEmojiOptions] = useState<ReturnType<typeof availableEmojis>>([]);
  const drag = useRef<{ original: Annotation; preview: Annotation; bounds: Box; handle: DragHandle; center: Point; start: Point; clientX: number; clientY: number; ratio: number; pointerId: number; moved: boolean } | null>(null);
  const selected = drag.current?.preview ?? s.annotations.find(a => a.id === s.selectedId);
  function endDrag(commit: boolean) {
    const current = drag.current; if (!current) return; drag.current = null;
    if (commit && current.moved) {
      try { if (current.preview.type === 'image') assets.current.get(current.preview.assetId, current.preview.width, current.preview.height); useEditor.getState().replace(current.preview); }
      catch (error) { setMessage(error instanceof Error ? error.message : 'Could not resize image.'); }
    }
    if (canvas.current?.hasPointerCapture(current.pointerId)) canvas.current.releasePointerCapture(current.pointerId);
    setRevision(v => v + 1);
  }
  function beginDrag(e: PointerEvent<HTMLElement>, handle: DragHandle, annotation = selected) {
    if (!annotation || busy || editing || picker || e.button !== 0 || drag.current) return;
    e.preventDefault(); canvas.current?.focus();
    const rect = canvas.current!.getBoundingClientRect(), ratio = display.width / rect.width;
    drag.current = { original: annotation, preview: annotation, bounds: annotationBounds(annotation, 0), handle, center: boxCenter(frameBounds(annotation)), start: sourcePoint({ x: (e.clientX - rect.left) * ratio, y: (e.clientY - rect.top) * ratio }, capture, s.quarterTurns), clientX: e.clientX, clientY: e.clientY, ratio, pointerId: e.pointerId, moved: false };
    canvas.current!.setPointerCapture(e.pointerId); setRevision(v => v + 1);
  }
  useEffect(() => {
    const move = (e: globalThis.PointerEvent) => {
      const d = drag.current; if (!d || e.pointerId !== d.pointerId) return;
      if (!d.moved && Math.hypot(e.clientX - d.clientX, e.clientY - d.clientY) < 3) return;
      d.moved = true; const delta = sourceVector({ x: (e.clientX - d.clientX) * d.ratio, y: (e.clientY - d.clientY) * d.ratio }, s.quarterTurns);
      d.preview = d.handle === 'rotate'
        ? { ...d.original, rotation: rotationFromPointer(rotationOf(d.original), d.center, d.start, { x: d.start.x + delta.x, y: d.start.y + delta.y }, e.shiftKey, rotationOf(d.preview)) }
        : d.handle === 'move' ? moveAnnotation(d.original, d.bounds, delta, capture) : resizeAnnotation(d.original, d.bounds, d.handle, delta, e.shiftKey, capture);
      setRevision(v => v + 1);
    };
    const up = (e: globalThis.PointerEvent) => { if (drag.current?.pointerId === e.pointerId) { move(e); endDrag(true); } };
    const abort = () => endDrag(false);
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', abort); window.addEventListener('lostpointercapture', abort); window.addEventListener('blur', abort);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', abort); window.removeEventListener('lostpointercapture', abort); window.removeEventListener('blur', abort); };
  }, [capture.width, capture.height, s.quarterTurns]);
  useEffect(() => {
    sessionId.current = capture.id; setReady(false); useEditor.getState().reset(); let disposed = false; const img = new Image();
    img.onload = () => { void loadGlyphFonts().then(() => { if (!disposed) { renderer.current = new Renderer(img, assets.current.get); setEmojiOptions(availableEmojis()); setReady(true); } }).catch(() => { if (!disposed) setMessage('Could not load annotation fonts. Please reopen this capture.'); }); };
    img.onerror = () => setMessage('Could not open the captured image.'); img.src = capture.image;
    return () => { disposed = true; sessionId.current = null; assets.current.dispose(); renderer.current?.dispose(); renderer.current = null; useEditor.getState().reset(); };
  }, [capture.id, capture.image]);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => { endDrag(false); const scale = Math.min(1, (entry.contentRect.width - 56) / display.width, (entry.contentRect.height - 88) / display.height); if (canvas.current) { canvas.current.style.width = `${Math.max(1, display.width * scale)}px`; canvas.current.style.height = `${Math.max(1, display.height * scale)}px`; } });
    observer.observe(area.current!); return () => observer.disconnect();
  }, [capture.width, capture.height, s.quarterTurns]);
  useEffect(() => { assets.current.retain(s.annotations); }, [s.annotations]);
  useEffect(() => {
    if (!ready || !canvas.current) return;
    const frame = requestAnimationFrame(() => {
      let all = draft.current ? [...s.annotations, draft.current] : s.annotations;
      if (drag.current) { const preview = drag.current.preview; all = all.map(a => a.id === preview.id ? preview : a); }
      if (editing) all = [...all.filter(a => a.id !== editing.id), ...(textError(editing.content) ? [] : [editing])];
      try { renderer.current?.render(canvas.current!, all, s.quarterTurns); }
      catch (error) { setMessage(error instanceof Error ? error.message : 'Could not render image.'); }
    }); return () => cancelAnimationFrame(frame);
  }, [s.annotations, s.selectedId, ready, revision, editing, capture.width, s.quarterTurns]);
  async function cancel() { const r = await window.screenshot.cancel(capture.id); if (!r.ok) setMessage(r.error); }
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (!editing && e.target instanceof HTMLElement && e.target.closest('input,textarea,select,[contenteditable=true]')) return; if (drag.current) { if (e.key === 'Escape') { e.preventDefault(); endDrag(false); } return; } if (busy || e.isComposing) return; if (e.key === 'Escape') { if (editing) setEditing(null); else if (picker || pendingEmoji) { setPicker(false); setPendingEmoji(null); s.setTool('select'); } else if (draft.current) { draft.current = null; setRevision(v => v + 1); } else void cancel(); }
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
  function point(e: PointerEvent<HTMLCanvasElement>) { const b = e.currentTarget.getBoundingClientRect(); return sourcePoint(pixelPoint({ x: e.clientX, y: e.clientY }, { x: b.left, y: b.top, width: b.width, height: b.height }, display), capture, s.quarterTurns); }
  function update(e: PointerEvent<HTMLCanvasElement>) {
    if (!draft.current) return; const p = point(e), a = draft.current;
    draft.current = 'points' in a ? { ...a, points: [...a.points, p] } : { ...a, end: shapeEnd(a.start, p, a.type === 'circle' || (a.type === 'rectangle' && e.shiftKey), capture) }; setRevision(v => v + 1);
  }
  async function insertImage() {
    if (!ready || busy || importing.current || editing || picker || drag.current || draft.current) return;
    importing.current = true; setBusy(true); setMessage('Opening image...');
    const id = capture.id;
    try {
      const result = await window.screenshot.importImage(id);
      if (sessionId.current !== id) return;
      if (!result.ok) throw new Error(result.error);
      if (!result.value) { setMessage('Image selection cancelled.'); return; }
      const asset = await assets.current.add(result.value);
      if (sessionId.current !== id) return;
      const scale = Math.min(1, capture.width * .6 / asset.width, capture.height * .6 / asset.height);
      const width = Math.max(2, asset.width * scale), height = Math.max(2, asset.height * scale), annotationId = crypto.randomUUID();
      assets.current.get(asset.assetId, width, height);
      s.add({ id: annotationId, type: 'image', assetId: asset.assetId, width, height, position: { x: (capture.width - width) / 2, y: (capture.height - height) / 2 } });
      setPendingEmoji(null); s.setTool('select'); s.select(annotationId); setMessage('Image inserted. Drag handles to resize or rotate.');
    } catch (error) { if (sessionId.current === id) { assets.current.retain(useEditor.getState().annotations); setMessage(error instanceof Error ? error.message : 'Could not insert image.'); } }
    finally { importing.current = false; if (sessionId.current === id) { setBusy(false); canvas.current?.focus(); } }
  }
  function imageSize(axis: 'width' | 'height', value: number, locked: boolean) {
    if (selected?.type !== 'image' || busy || drag.current) return;
    try { const next = setImageSize(selected, axis, value, locked, capture); assets.current.get(next.assetId, next.width, next.height); s.replace(next); setMessage(''); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Invalid image size.'); }
  }
  function rotateScreenshot() {
    if (!ready || busy || importing.current || editing || picker || pendingEmoji || drag.current || draft.current) return;
    useEditor.getState().rotateScreenshot(); canvas.current?.focus(); setMessage('');
  }
  async function output(action: 'copy' | 'save') {
    if (!renderer.current || busy || editing || picker || drag.current || draft.current) return; setBusy(true); setMessage('');
    try { const r = await window.screenshot.output(capture.id, action, renderer.current.export(useEditor.getState().annotations, useEditor.getState().quarterTurns)); setMessage(r.ok ? r.value === 'cancelled' ? 'Save cancelled. Your image is still here.' : r.value === 'saved' ? 'PNG saved.' : 'Image copied to clipboard.' : r.error); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Export failed. Please try again.'); } finally { setBusy(false); }
  }
  return <main className="editor"><Toolbar rotateScreenshot={rotateScreenshot} rotationBlocked={!!pendingEmoji} busy={busy || !!editing || picker || !!drag.current || !!draft.current} ready={ready} insertImage={() => void insertImage()} imageSize={imageSize} chooseTool={chooseTool} output={action => void output(action)} cancel={() => void cancel()} /><div ref={area} className="canvas-area"><div className="canvas-stage"><canvas ref={canvas} tabIndex={0} width={display.width} height={display.height} aria-label="Screenshot annotation canvas" style={{ cursor: s.tool === 'select' ? 'default' : s.tool === 'text' ? 'text' : 'crosshair' }} onDoubleClick={e => {
    if (s.tool !== 'select' || editing || picker || busy) return; const b = e.currentTarget.getBoundingClientRect();
    const id = hitTest(s.annotations, sourcePoint(pixelPoint({ x: e.clientX, y: e.clientY }, { x: b.left, y: b.top, width: b.width, height: b.height }, display), capture, s.quarterTurns), 5 * display.width / b.width);
    const a = s.annotations.find(a => a.id === id); if (a?.type === 'text') setEditing({ ...a });
  }} onPointerDown={e => {
    if (!ready || busy || editing || picker || e.button !== 0) return; const p = point(e); e.currentTarget.focus();
    if (s.tool === 'select') { const id = hitTest(s.annotations, p, 5 * display.width / e.currentTarget.getBoundingClientRect().width); s.select(id); const a = s.annotations.find(a => a.id === id); if (a) beginDrag(e, 'move', a); return; }
    if (s.tool === 'text') { s.select(null); setEditing({ id: crypto.randomUUID(), type: 'text', content: '', position: p, color: s.color, fontFamily: 'Segoe UI', fontSize: s.textSize, lineHeight: 1.25 }); return; }
    if (s.tool === 'emoji') { if (pendingEmoji) { const id = crypto.randomUUID(); s.add({ id, type: 'emoji', content: pendingEmoji, position: p, size: s.emojiSize }); setPendingEmoji(null); s.setTool('select'); s.select(id); } else setPicker(true); return; }
    e.currentTarget.setPointerCapture(e.pointerId);
    s.select(null); const base = { id: crypto.randomUUID(), width: s.tool === 'blurStroke' ? s.blurWidth : s.width };
    draft.current = s.tool === 'blurStroke' ? { ...base, type: 'blurStroke', points: [p] } : s.tool === 'freehand' ? { ...base, type: 'freehand', color: s.color, points: [p] } : { ...base, type: s.tool, color: s.color, start: p, end: p }; setRevision(v => v + 1);
  }} onPointerMove={e => { if (!busy && !drag.current) update(e); }} onPointerUp={e => { if (drag.current) return; update(e); if (draft.current && nonEmpty(draft.current)) s.add(draft.current); draft.current = null; if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); setRevision(v => v + 1); }} onPointerCancel={() => { draft.current = null; setRevision(v => v + 1); }} />{selected && !editing && !picker && <SelectionHandles quarterTurns={s.quarterTurns} bounds={frameBounds(selected)} rotation={rotationOf(selected)} rotatable={canRotate(selected)} width={capture.width} height={capture.height} start={beginDrag} edit={() => { if (!drag.current && selected.type === 'text') setEditing({ ...selected }); }} />}</div></div>{editing && <TextComposer value={editing} change={next => setEditing(previous => previous ? preserveGlyphOrigin(previous, next) : next)} done={finishText} cancel={() => { setEditing(null); requestAnimationFrame(() => canvas.current?.focus()); }} />}{picker && <EmojiPicker options={emojiOptions} choose={emoji => { setPendingEmoji(emoji); setPicker(false); canvas.current?.focus(); }} cancel={closePanel} />}<footer><span>{display.width} × {display.height} px · Original resolution</span><span role="status" aria-atomic="true" data-success={!pendingEmoji && (message === 'Image copied to clipboard.' || message === 'PNG saved.')}>{pendingEmoji ? 'Click the image to place the emoji · Esc to discard' : message || 'Drag rotation handle: rotate · Shift: square / snap 15° · Double-click text: edit · Delete: remove · Esc: cancel'}</span></footer></main>;
}


