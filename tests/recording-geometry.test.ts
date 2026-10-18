import { expect,it } from 'vitest';
import { recordingCrop,recordingSize } from '../shared/recording-geometry';
import { validRecordingConfig } from '../shared/recording-contracts';
it.each([1,1.25,1.5,2])('maps local DIP at scale %s without desktop-origin distortion',scale=>{
  const region={x:101,y:99,width:300,height:200},bounds={x:-1920,y:-200,width:1920,height:1080};
  const r=recordingCrop(region,bounds,1920*scale,1080*scale);
  expect(Math.abs(r.x-region.x*scale)).toBeLessThanOrEqual(2);
  expect(Math.abs(r.x+r.width-(region.x+region.width)*scale)).toBeLessThanOrEqual(2);
  expect(r.width%2).toBe(0);
});
it('rejects invalid regions, accounts for downscaling and preserves aspect ratio',()=>{
  expect(()=>recordingCrop({x:0,y:0,width:Infinity,height:100},{x:0,y:0,width:100,height:100},100,100)).toThrow();
  expect(()=>recordingCrop({x:90,y:0,width:20,height:20},{x:0,y:0,width:100,height:100},100,100)).toThrow();
  expect(recordingCrop({x:100,y:100,width:200,height:200},{x:0,y:0,width:2000,height:2000},1000,1000)).toEqual({x:50,y:50,width:100,height:100});
  expect(recordingSize(3840,2160)).toEqual({width:1920,height:1080});
  expect(validRecordingConfig({sourceId:'a',mode:'full',mic:false,micId:'',countdown:true,region:null})).toBe(true);
  expect(validRecordingConfig({sourceId:'a',mode:'full',mic:0})).toBe(false);
});
