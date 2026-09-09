import { useEffect, useState } from 'react';
import type { CaptureData } from '../shared/contracts';
import { ShortcutSettings } from './settings/ShortcutSettings';
import { SelectionOverlay } from './capture/SelectionOverlay';
import { Editor } from './editor/Editor';
export function App() {
  const view = location.hash.slice(1);
  const [capture, setCapture] = useState<CaptureData | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { if (view !== 'settings') window.screenshot.current().then(r => r.ok ? setCapture(r.value) : setError(r.error)); }, [view]);
  if (view === 'settings') return <ShortcutSettings />;
  if (!capture) return <p role="status">{error || 'Preparing capture…'}</p>;
  return view === 'region' ? <SelectionOverlay capture={capture} /> : <Editor capture={capture} />;
}
