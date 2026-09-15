import { useEffect, useRef, useState } from 'react';
import type { Rect } from '../../shared/contracts';
export function RegionOverlay() {
  const [rect,setRect]=useState<Rect|null>(null),[error,setError]=useState('');
  const drag=useRef<{x:number;y:number;mode:string;rect:Rect|null}|null>(null);
  async function submit(value:Rect|null){const r=await window.recording.regionSelected(value);if(!r.ok)setError(r.error);}
  useEffect(()=>{const handler=(e:KeyboardEvent)=>{if(e.key==='Escape')void submit(null);if(e.key==='Enter' && rect)void submit(rect);};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);},[rect]);
  return <main className="recording-region" onPointerDown={e=>{if(e.button!==0)return;const mode=(e.target as HTMLElement).dataset.handle??'new';drag.current={x:e.clientX,y:e.clientY,mode,rect};e.currentTarget.setPointerCapture(e.pointerId);if(mode==='new')setRect(null);}} onPointerMove={e=>{
    const start=drag.current;if(!start)return;
    const x=Math.max(0,Math.min(innerWidth,e.clientX)),y=Math.max(0,Math.min(innerHeight,e.clientY));
    if(start.mode==='new')setRect({x:Math.min(start.x,x),y:Math.min(start.y,y),width:Math.abs(start.x-x),height:Math.abs(start.y-y)});
    else if(start.rect){
      const r=start.rect,dx=x-start.x,dy=y-start.y;
      if(start.mode==='move')setRect({...r,x:Math.max(0,Math.min(innerWidth-r.width,r.x+dx)),y:Math.max(0,Math.min(innerHeight-r.height,r.y+dy))});
      else {
        const left=start.mode.includes('w')?Math.max(0,Math.min(r.x+r.width-2,r.x+dx)):r.x;
        const top=start.mode.includes('n')?Math.max(0,Math.min(r.y+r.height-2,r.y+dy)):r.y;
        const right=start.mode.includes('e')?Math.min(innerWidth,Math.max(r.x+2,r.x+r.width+dx)):r.x+r.width;
        const bottom=start.mode.includes('s')?Math.min(innerHeight,Math.max(r.y+2,r.y+r.height+dy)):r.y+r.height;
        setRect({x:left,y:top,width:right-left,height:bottom-top});
      }
    }
  }} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}>
    {rect?<div className="recording-selection" data-handle="move" style={{left:rect.x,top:rect.y,width:rect.width,height:rect.height}}>
      {(['nw','n','ne','e','se','s','sw','w'] as const).map(handle=><span key={handle} data-handle={handle} className="recording-region-handle" style={{left:handle.includes('w')?'0':handle.includes('e')?'100%':'50%',top:handle.includes('n')?'0':handle.includes('s')?'100%':'50%',cursor:handle+'-resize'}}/>)}
    </div>:null}
    <div className="recording-region-hint" onPointerDown={e=>e.stopPropagation()}>
      <strong>{rect?`${Math.round(rect.width*devicePixelRatio)} × ${Math.round(rect.height*devicePixelRatio)} px`:'Drag to select a recording area'}</strong>
      <span>{error || 'Drag again to adjust · Enter to confirm · Esc to cancel'}</span>
      <button onClick={()=>void submit(rect)} disabled={!rect}>Use region</button><button onClick={()=>void submit(null)}>Cancel</button>
    </div>
  </main>;
}
