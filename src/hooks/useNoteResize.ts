import { useState, useEffect, useCallback } from 'react';
import { getProject, getMidiPartNotes, updateNoteInMidiPart } from '../store/projectStore';
import { secondsToTicksPure, getPpqn, getTimeSignature } from '../utils/midiTickUtils';
import { MIDI_CONSTANTS } from '../constants/midi';

/**
 * useNoteResize 훅 Props
 * Phase 7.9.5: 노트 리사이즈 로직을 훅으로 추출
 */
export interface UseNoteResizeProps {
  // Data
  partId: string;
  bpm: number;
  timeSignature: [number, number];
  pixelsPerSecond: number | null;
  initialPixelsPerSecond: number;
  
  // Refs
  pianoRollRef: React.RefObject<HTMLDivElement | null>;
  
  // UI State
  isQuantizeEnabled: boolean;
  
  // States
  setPartNotes: (notes: any[] | ((prev: any[]) => any[])) => void;
}

/**
 * useNoteResize 훅 반환 타입
 */
export interface UseNoteResizeReturn {
  // States
  isResizingNote: boolean;
  setIsResizingNote: (value: boolean) => void;
  resizingNoteIndex: number;
  setResizingNoteIndex: (value: number) => void;
  resizeSide: 'left' | 'right' | null;
  setResizeSide: (value: 'left' | 'right' | null) => void;
  resizeStartPos: { x: number; originalStartTick: number; originalDurationTicks: number } | null;
  setResizeStartPos: (value: { x: number; originalStartTick: number; originalDurationTicks: number } | null) => void;
  resizePreview: { startTick: number; durationTicks: number } | null;
  setResizePreview: (value: { startTick: number; durationTicks: number } | null) => void;
  
  // Functions
  finalizeResize: () => void;
}

/**
 * 노트 리사이즈 로직을 관리하는 훅
 * Phase 7.9.5: 노트 리사이즈 로직을 훅으로 추출
 */
export const useNoteResize = ({
  partId,
  bpm,
  timeSignature,
  pixelsPerSecond,
  initialPixelsPerSecond,
  pianoRollRef,
  isQuantizeEnabled,
  setPartNotes,
}: UseNoteResizeProps): UseNoteResizeReturn => {
  
  // 리사이즈 관련 상태
  const [isResizingNote, setIsResizingNote] = useState(false);
  const [resizingNoteIndex, setResizingNoteIndex] = useState<number>(-1);
  const [resizeSide, setResizeSide] = useState<'left' | 'right' | null>(null);
  const [resizeStartPos, setResizeStartPos] = useState<{ x: number; originalStartTick: number; originalDurationTicks: number } | null>(null);
  const [resizePreview, setResizePreview] = useState<{ startTick: number; durationTicks: number } | null>(null);

  // 리사이즈 완료
  const finalizeResize = useCallback(() => {
    if (resizePreview && resizingNoteIndex >= 0) {
      updateNoteInMidiPart(partId, resizingNoteIndex, {
        startTick: resizePreview.startTick,
        durationTicks: resizePreview.durationTicks,
      });
      setPartNotes(getMidiPartNotes(partId));
    }
    setIsResizingNote(false);
    setResizingNoteIndex(-1);
    setResizeSide(null);
    setResizeStartPos(null);
    setResizePreview(null);
  }, [partId, resizePreview, resizingNoteIndex, setPartNotes]);

  // 전역 마우스 이벤트 리스너 (리사이즈용)
  useEffect(() => {
    if (!isResizingNote || !resizeStartPos || !resizeSide) return;

    const handleResizeMove = (event: MouseEvent) => {
      if (!pianoRollRef.current || !resizeStartPos || !resizeSide) return;
      const rect = pianoRollRef.current.getBoundingClientRect();
      const x = event.clientX - rect.left;
      
      const project = getProject();
      const part = project.midiParts.find(p => p.id === partId);
      if (!part) return;

      const currentPixelsPerSecond = pixelsPerSecond || initialPixelsPerSecond;
      const deltaSeconds = (x - resizeStartPos.x) / currentPixelsPerSecond;
      const timeSignature = getTimeSignature(project);
      const ppqn = getPpqn(project);
      const tempoMap = project.timing?.tempoMap ?? [];
      const { startTick: deltaTicks } = secondsToTicksPure(
        deltaSeconds,
        0,
        tempoMap,
        timeSignature,
        ppqn
      );

      const minDuration = MIDI_CONSTANTS.MIN_NOTE_DURATION_TICKS;
      const originalStart = resizeStartPos.originalStartTick;
      const originalDuration = resizeStartPos.originalDurationTicks;
      const originalEnd = originalStart + originalDuration;
      const maxEnd = part.durationTicks ?? originalEnd;

      let nextStart = originalStart;
      let nextDuration = originalDuration;

      if (resizeSide === 'left') {
        nextStart = originalStart + deltaTicks;
        if (isQuantizeEnabled) {
          const ticksPerBeat = getPpqn(getProject());
          nextStart = Math.round(nextStart / ticksPerBeat) * ticksPerBeat;
        }
        nextStart = Math.max(0, Math.min(nextStart, originalEnd - minDuration));
        nextDuration = originalEnd - nextStart;
      } else {
        let nextEnd = originalEnd + deltaTicks;
        if (isQuantizeEnabled) {
          const ticksPerBeat = getPpqn(getProject());
          nextEnd = Math.round(nextEnd / ticksPerBeat) * ticksPerBeat;
        }
        nextEnd = Math.max(originalStart + minDuration, Math.min(nextEnd, maxEnd));
        nextDuration = nextEnd - originalStart;
      }

      setResizePreview({
        startTick: nextStart,
        durationTicks: nextDuration,
      });
    };

    const handleResizeUp = () => {
      if (resizePreview && resizingNoteIndex >= 0) {
        updateNoteInMidiPart(partId, resizingNoteIndex, {
          startTick: resizePreview.startTick,
          durationTicks: resizePreview.durationTicks,
        });
        setPartNotes(getMidiPartNotes(partId));
      }
      setIsResizingNote(false);
      setResizingNoteIndex(-1);
      setResizeSide(null);
      setResizeStartPos(null);
      setResizePreview(null);
    };

    window.addEventListener('mousemove', handleResizeMove);
    window.addEventListener('mouseup', handleResizeUp);

    return () => {
      window.removeEventListener('mousemove', handleResizeMove);
      window.removeEventListener('mouseup', handleResizeUp);
    };
  }, [bpm, initialPixelsPerSecond, isResizingNote, isQuantizeEnabled, partId, pixelsPerSecond, resizePreview, resizeSide, resizeStartPos, resizingNoteIndex, setPartNotes, timeSignature, pianoRollRef]);

  return {
    // States
    isResizingNote,
    setIsResizingNote,
    resizingNoteIndex,
    setResizingNoteIndex,
    resizeSide,
    setResizeSide,
    resizeStartPos,
    setResizeStartPos,
    resizePreview,
    setResizePreview,
    
    // Functions
    finalizeResize,
  };
};

