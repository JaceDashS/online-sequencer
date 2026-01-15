import { useCallback } from 'react';
import { getProject, getMidiPartNotes, addNoteToMidiPart } from '../store/projectStore';
import { secondsToTicksPure, getTimeSignature, getPpqn, getBpm } from '../utils/midiTickUtils';
import type { MidiNote } from '../types/project';
import type { AudioEngine } from '../core/audio/AudioEngine';

/**
 * useMidiEditorDoubleClick 훅 Props
 * Phase 7.9.3.4: 더블클릭 핸들러를 훅으로 추출
 */
export interface UseMidiEditorDoubleClickProps {
  // Refs
  audioEngineRef: React.RefObject<AudioEngine | null>;
  
  // Functions
  getTimeAndPitchFromMouse: (e: React.MouseEvent | MouseEvent) => { time: number; pitch: number } | null;
  clampPianoPitch: (pitch: number) => number;
  
  // Data
  partId: string;
  bpm: number;
  timeSignature: [number, number];
  
  // States
  setPartNotes: (notes: MidiNote[] | ((prev: MidiNote[]) => MidiNote[])) => void;
}

/**
 * useMidiEditorDoubleClick 훅 반환 타입
 */
export interface UseMidiEditorDoubleClickReturn {
  handlePianoRollDoubleClick: (e: React.MouseEvent) => void;
}

/**
 * MIDI 에디터 더블클릭 핸들러를 관리하는 훅
 * Phase 7.9.3.4: 더블클릭 핸들러를 훅으로 추출
 */
export const useMidiEditorDoubleClick = ({
  audioEngineRef,
  getTimeAndPitchFromMouse,
  clampPianoPitch,
  partId,
  bpm,
  timeSignature,
  setPartNotes,
}: UseMidiEditorDoubleClickProps): UseMidiEditorDoubleClickReturn => {
  
  const handlePianoRollDoubleClick = useCallback((e: React.MouseEvent) => {
    const result = getTimeAndPitchFromMouse(e);
    if (!result) return;
    
    const project = getProject();
    const part = project.midiParts.find(p => p.id === partId);
    if (!part) return;
    
    // Tick 기반 노트 생성 (더블 클릭, SMF 표준 정합)
    // result.time은 파트 내부의 상대 시간(초)이므로, Tick으로 변환
    const timeSignature = getTimeSignature(project);
    const ppqn = getPpqn(project);
    const tempoMap = project.timing?.tempoMap ?? [];
    
    // 그리드 크기 계산
    const bpm = getBpm(project);
    const beatUnit = timeSignature[1];
    const noteValueRatio = 4 / beatUnit;
    const secondsPerBeat = (60 / bpm) * noteValueRatio;
    const { startTick: relativeStartTick, durationTicks: noteDurationTicks } = secondsToTicksPure(
      result.time,
      secondsPerBeat,
      tempoMap,
      timeSignature,
      ppqn
    );
    
    const newNote: MidiNote = {
      note: clampPianoPitch(result.pitch),
      velocity: 100,
      startTick: relativeStartTick,
      durationTicks: noteDurationTicks,
    };
    
    addNoteToMidiPart(partId, newNote);
    setPartNotes(getMidiPartNotes(partId));
    
    // 노트 생성 시 사운드 피드백
    if (audioEngineRef.current) {
      const track = project.tracks.find(t => t.id === part.trackId);
      const instrument = track?.instrument || 'piano';
      void audioEngineRef.current.previewNote(newNote.note, newNote.velocity ?? 100, instrument);
    }
  }, [getTimeAndPitchFromMouse, clampPianoPitch, partId, bpm, timeSignature, setPartNotes, audioEngineRef]);

  return {
    handlePianoRollDoubleClick,
  };
};

