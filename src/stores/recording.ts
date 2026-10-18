import { create } from 'zustand';
import type { RecordingSnapshot } from '../../shared/recording-contracts';
export const useRecording = create<{snapshot:RecordingSnapshot|null;receive:(snapshot:RecordingSnapshot)=>void}>(set=>({
  snapshot:null,
  receive:snapshot=>set(current=>!current.snapshot || snapshot.revision>=current.snapshot.revision?{snapshot}:{}),
}));
