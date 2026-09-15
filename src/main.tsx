import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
const view=location.hash.slice(1);
if(view==='recording-region')document.documentElement.style.background='transparent';
if(view==='recorder') {
  void import('./recording/recorder').then(({bootRecorder})=>bootRecorder());
} else {
  const Component=React.lazy(async()=>{
    if(view==='recording')return {default:(await import('./recording/Setup')).Setup};
    if(view==='recording-region')return {default:(await import('./recording/RegionOverlay')).RegionOverlay};
    return {default:(await import('./App')).App};
  });
  createRoot(document.getElementById('root')!).render(<React.StrictMode><React.Suspense fallback={<p role="status">Loading…</p>}><Component/></React.Suspense></React.StrictMode>);
}
