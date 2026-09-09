import { useEffect, useState, type KeyboardEvent } from 'react';
import { Scan, Monitor, Keyboard, ShieldCheck } from 'lucide-react';
import type { DisplayInfo, Shortcuts } from '../../shared/contracts';
import { Button } from '../components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../components/ui/card';
import { Field, FieldGroup, FieldLabel, FieldDescription } from '../components/ui/field';
import { Input } from '../components/ui/input';
const logoUrl = new URL('../../assets/logo.png', import.meta.url).href;
function accelerator(e: KeyboardEvent<HTMLInputElement>) {
  const key = e.code.startsWith('Key') ? e.code.slice(3) : e.code.startsWith('Digit') ? e.code.slice(5) : /^(F\d{1,2}|PrintScreen)$/.test(e.key) ? e.key : '';
  return key ? [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Super', key].filter(Boolean).join('+') : null;
}
export function ShortcutSettings() {
  const [shortcuts, setShortcuts] = useState<Shortcuts>({ full: '', region: '' });
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  const [displayId, setDisplayId] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    const refresh = async () => { const r = await window.screenshot.displays(); if (!alive) return; if (!r.ok) { setMessage(r.error); return; }
      setDisplays(r.value.displays); setDisplayId(previous => previous === undefined ? r.value.defaultId : r.value.displays.some(d => d.id === previous) ? previous : null);
    };
    const unsubscribe = window.screenshot.onDisplaysChanged(() => void refresh());
    void refresh(); window.addEventListener('focus', refresh);
    return () => { alive = false; unsubscribe(); window.removeEventListener('focus', refresh); };
  }, []);
  useEffect(() => { window.screenshot.settings().then(r => { if (r.ok) { setShortcuts(r.value.settings.shortcuts); setMessage(r.value.warning); } else setMessage(r.error); }); }, []);
  async function capture(mode: 'full' | 'region') { if (displayId == null) return; setBusy(true); const r = await window.screenshot.capture({ mode, target: { kind: 'display', displayId } }); if (!r.ok) setMessage(r.error); setBusy(false); }
  async function apply() { setBusy(true); const r = await window.screenshot.updateShortcuts(shortcuts); setMessage(r.ok ? 'Shortcuts registered and saved.' : r.error); setBusy(false); }
  return <main className="settings">
    <header className="settings-header"><div className="flex items-center gap-3"><img className="settings-logo" src={logoUrl} alt="Screenshot logo" width={44} height={44} draggable={false} /><div><h1>Screenshot</h1><p className="settings-subtitle">Capture & shortcuts</p></div></div><span className="settings-private"><ShieldCheck size={14} /> Local only</span></header>
    <section aria-label="Quick capture" className="mt-6">
      <FieldGroup className="gap-3"><Field className="gap-2"><FieldLabel htmlFor="capture-display">Capture display</FieldLabel><select id="capture-display" className="w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm" value={displayId ?? ''} disabled={busy} onChange={e => setDisplayId(Number(e.target.value))}><option value="" disabled>Choose a connected display</option>{displays.map(d => <option key={d.id} value={d.id}>{d.label} · {d.width} × {d.height} · ({d.bounds.x}, {d.bounds.y})</option>)}</select>{displayId === null && <p role="alert" className="text-sm text-destructive">Display disconnected. Choose another.</p>}</Field></FieldGroup>
      <div className="grid grid-cols-2 gap-3 mt-3"><Button onClick={() => void capture('full')} disabled={busy || displayId == null}><Monitor /> Full screen</Button><Button variant="outline" onClick={() => void capture('region')} disabled={busy || displayId == null}><Scan /> Select region</Button></div>
    </section>
    <Card className="mt-5 gap-4 py-4"><CardHeader className="gap-1 px-5"><CardTitle className="flex items-center gap-2"><Keyboard size={17} /> Shortcuts</CardTitle><CardDescription>Click a field, then press your key combination.</CardDescription></CardHeader><CardContent className="px-5"><FieldGroup className="gap-3">
      {(['full', 'region'] as const).map(mode => <Field orientation="horizontal" className="items-center justify-between" key={mode}><FieldLabel htmlFor={mode}>{mode === 'full' ? 'Full screen' : 'Select region'}</FieldLabel><Input className="w-52 h-9" id={mode} type="text" aria-label={`${mode} shortcut`} value={shortcuts[mode]} disabled={busy} readOnly onKeyDown={e => { if (e.key === 'Tab') return; e.preventDefault(); const key = accelerator(e); if (key) setShortcuts(s => ({ ...s, [mode]: key })); }} /></Field>)}
    </FieldGroup></CardContent><CardFooter className="justify-between gap-3 px-5"><FieldDescription>Captures the display under your cursor.</FieldDescription><Button variant="outline" className="h-8" onClick={() => void apply()} disabled={busy || !shortcuts.full || !shortcuts.region}>Apply shortcuts</Button></CardFooter></Card>
    <p className="settings-status" role="status">{message}</p><footer className="settings-footer">Closing this window keeps Screenshot in the tray.</footer>
  </main>;
}


