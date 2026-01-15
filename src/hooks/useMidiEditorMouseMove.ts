import { useCallback, useEffect } from 'react';
import { getProject } from '../store/projectStore';
import { isSplitMode, useUIState } from '../store/uiStore';
import { ticksToSecondsPure, getTimeSignature, getPpqn } from '../utils/midiTickUtils';
import type { MidiNote } from '../types/project';

type UIStateType = ReturnType<typeof useUIState>;

/**
 * useMidiEditorMouseMove 훅 Props
 * Phase 7.9.3.2: 마우스 이동 핸들러를 훅으로 추출
 */
export interface UseMidiEditorMouseMoveProps {
  // Refs
  pianoRollRef: React.RefObject<HTMLDivElement>;
  
  // Drag
  handleDragMouseMove: (x: number, y: number, e: React.MouseEvent | MouseEvent) => void;
  isDragging: boolean;
  
  // UI
  ui: UIStateType;
  
  // Functions
  calculateLanePositions: () => Array<{ index: number; top: number; height: number; isBlackKey: boolean }>;
  getTimeAndPitchFromMouse: (e: React.MouseEvent | MouseEvent) => { time: number; pitch: number } | null;
  quantizeNote: (time: number, gridSize: number) => number;
  
  // Data
  partId: string;
  partNotes: MidiNote[];
  bpm: number;
  timeSignature: [number, number];
  pixelsPerSecond: number | null;
  initialPixelsPerSecond: number;
  
  // Quantization
  partStartTime: number;
  
  // States - Split
  setSplitPreviewX: (value: number | null) => void;
  setSplitPreviewNoteIndex: (value: number | null) => void;
  
  // States - Resize
  isResizingNote: boolean;
  selectedNotes: Set<number>;
  setHoveredResizeHandle: (value: number | null) => void;
  
  // States - Drawing
  isDrawing: boolean;
  drawingNote: { note: number; startTime: number; endTime?: number } | null;
  setDrawingNote: (value: { note: number; startTime: number; endTime?: number } | null) => void;
  setHoveredNote: (value: number | null) => void;
  
  // States - Selection
  isSelecting: boolean;
  selectionRect: { startX: number; startY: number; endX: number; endY: number } | null;
  setSelectionRect: (value: { startX: number; startY: number; endX: number; endY: number } | null) => void;
  marqueeSelectionSourceRef?: React.MutableRefObject<'pianoRoll' | 'footer' | null>;
}

/**
 * useMidiEditorMouseMove 훅 반환 타입
 */
export interface UseMidiEditorMouseMoveReturn {
  handlePianoRollMouseMove: (e: React.MouseEvent) => void;
}

/**
 * MIDI 에디터 마우스 이동 핸들러를 관리하는 훅
 * Phase 7.9.3.2: 마우스 이동 핸들러를 훅으로 추출
 */
export const useMidiEditorMouseMove = ({
  pianoRollRef,
  handleDragMouseMove,
  isDragging,
  ui,
  calculateLanePositions,
  getTimeAndPitchFromMouse,
  quantizeNote,
  partId,
  partNotes,
  bpm,
  timeSignature,
  pixelsPerSecond,
  initialPixelsPerSecond,
  setSplitPreviewX,
  setSplitPreviewNoteIndex,
  isResizingNote,
  selectedNotes,
  setHoveredResizeHandle,
  isDrawing,
  drawingNote,
  setDrawingNote,
  setHoveredNote,
  isSelecting,
  selectionRect,
  setSelectionRect,
  marqueeSelectionSourceRef,
  partStartTime,
}: UseMidiEditorMouseMoveProps): UseMidiEditorMouseMoveReturn => {
  
  const handlePianoRollMouseMove = useCallback((e: React.MouseEvent) => {
    if (!pianoRollRef.current) return;
    const rect = pianoRollRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // useNoteDrag 훅의 handleMouseMove 사용 (드래그 시작/이동 처리)
    handleDragMouseMove(x, y, e);
    
    // Ctrl 키 상태 업데이트 (기존 로직 유지)
    const isCtrlPressed = e.ctrlKey || e.metaKey;
    if (isDragging) {
      if (isCtrlPressed) {
        ui.setDuplicateModeActive(true);
      } else {
        ui.setDuplicateModeActive(false);
      }
    }

    // 드래그 중이면 나머지 로직 건너뛰기 (useNoteDrag의 onDragMove에서 처리)
    if (isDragging) {
      return;
    }
    
    // Split 모드일 때 가이드 라인 업데이트
    if (isSplitMode(ui.cursorMode)) {
      // 현재 마우스 위치가 어떤 노트 위에 있는지 확인
      const lanes = calculateLanePositions();
      const project = getProject();
      const part = project.midiParts.find(p => p.id === partId);
      if (part) {
        // 모든 노트 확인
        for (let i = partNotes.length - 1; i >= 0; i--) {
          const note = partNotes[i];
          // Tick 기반으로 노트 위치 계산 (SMF 표준 정합)
          // 노트는 파트 내부의 상대 위치로 저장되어 있음
          const project = getProject();
          const noteStartTickRelative = note.startTick;
          const noteDurationTicks = note.durationTicks ?? 0;
          const timeSignature = getTimeSignature(project);
          const ppqn = getPpqn(project);
          const tempoMap = project.timing?.tempoMap ?? [];
          const { startTime: noteStartTime, duration: noteDuration } = ticksToSecondsPure(
            noteStartTickRelative,
            noteDurationTicks,
            tempoMap,
            timeSignature,
            ppqn
          );
          const currentPixelsPerSecond = pixelsPerSecond || initialPixelsPerSecond;
          const noteX = noteStartTime * currentPixelsPerSecond;
          const noteWidth = noteDuration * currentPixelsPerSecond;
          const laneIndex = note.note;
          const lane = lanes.find(l => l.index === laneIndex);
          
          if (!lane) continue;
          
          const noteY = (lane.top / 100) * rect.height;
          const noteHeight = (lane.height / 100) * rect.height;
          
          // 노트 내부에 마우스가 있는지 확인
          if (x >= noteX && x <= noteX + noteWidth &&
              y >= noteY && y <= noteY + noteHeight) {
            // 퀀타이즈가 활성화되어 있으면 그리드에 스냅
            let previewX = x;
            if (ui.isQuantizeEnabled) {
              const currentPixelsPerSecond = pixelsPerSecond || initialPixelsPerSecond;
              // 마우스 X 좌표를 시간으로 변환 (파트 기준 상대)
              const clickTime = (x - noteX) / currentPixelsPerSecond;
              const absoluteClickTime = noteStartTime + clickTime;
              
              // 퀀타이즈 그리드에 스냅
              const beatUnit = timeSignature[1];
              const noteValueRatio = 4 / beatUnit;
              const secondsPerBeat = (60 / bpm) * noteValueRatio;
              const snappedAbsoluteTime = Math.round(absoluteClickTime / secondsPerBeat) * secondsPerBeat;
              
              // 스냅된 시간이 노트 범위 내에 있는지 확인
              const snappedTime = snappedAbsoluteTime - noteStartTime;
              if (snappedTime >= 0 && snappedTime <= noteDuration) {
                // 다시 픽셀 좌표로 변환
                previewX = noteX + snappedTime * currentPixelsPerSecond;
              }
            }
            setSplitPreviewX(previewX);
            setSplitPreviewNoteIndex(i);
            return;
          }
        }
      }
      // 노트 위에 없으면 가이드 숨김
      setSplitPreviewX(null);
      setSplitPreviewNoteIndex(null);
    }
    
    // 리사이즈 핸들 호버 감지 (Split 모드가 아닐 때만)
    if (!isSplitMode(ui.cursorMode) && !isResizingNote) {
      const RESIZE_HANDLE_WIDTH = 8;
      let foundResizeHandle = false;
      const lanes = calculateLanePositions();
      const project = getProject();
      const part = project.midiParts.find(p => p.id === partId);
      if (part) {
        // 모든 노트 확인 (선택된 노트 우선)
        const notesToCheck = selectedNotes.size > 0 
          ? Array.from(selectedNotes).map(i => ({ index: i, note: partNotes[i] })).filter(item => item.note)
          : partNotes.map((note, i) => ({ index: i, note }));
        
        for (const { index: i, note } of notesToCheck) {
          if (!note) continue;
          // Tick 기반으로 노트 위치 계산 (SMF 표준 정합)
          // 노트는 파트 내부의 상대 위치로 저장되어 있음
          const project = getProject();
          const noteStartTickRelative = note.startTick;
          const noteDurationTicks = note.durationTicks ?? 0;
          const timeSignature = getTimeSignature(project);
          const ppqn = getPpqn(project);
          const tempoMap = project.timing?.tempoMap ?? [];
          const { startTime: noteStartTime, duration: noteDuration } = ticksToSecondsPure(
            noteStartTickRelative,
            noteDurationTicks,
            tempoMap,
            timeSignature,
            ppqn
          );
          const currentPixelsPerSecond = pixelsPerSecond || initialPixelsPerSecond;
          const noteX = noteStartTime * currentPixelsPerSecond;
          const noteWidth = noteDuration * currentPixelsPerSecond;
          const laneIndex = note.note;
          const lane = lanes.find(l => l.index === laneIndex);
          
          if (!lane) continue;
          
          const noteY = (lane.top / 100) * rect.height;
          const noteHeight = (lane.height / 100) * rect.height;
          const noteRightEdge = noteX + noteWidth;
          
          // 왼쪽 끝과 오른쪽 끝 리사이즈 핸들 확인
          const isLeftResize = x >= noteX - RESIZE_HANDLE_WIDTH / 2 && x <= noteX + RESIZE_HANDLE_WIDTH / 2 &&
              y >= noteY && y <= noteY + noteHeight;
          const isRightResize = x >= noteRightEdge - RESIZE_HANDLE_WIDTH / 2 && x <= noteRightEdge + RESIZE_HANDLE_WIDTH / 2 &&
              y >= noteY && y <= noteY + noteHeight;
          
          if (isLeftResize || isRightResize) {
            setHoveredResizeHandle(i);
            foundResizeHandle = true;
            break;
          }
        }
      }
      if (!foundResizeHandle) {
        setHoveredResizeHandle(null);
      }
    } else {
      setHoveredResizeHandle(null);
    }
    
    // 노트 그리기 중
    if (isDrawing && drawingNote) {
      const result = getTimeAndPitchFromMouse(e);
      if (!result) return;
      
      let endTime = result.time;
      
      // 퀀타이즈가 활성화되어 있으면 마디 기준으로 퀀타이즈
      if (ui.isQuantizeEnabled) {
        const project = getProject();
        const projectTimeSignature = getTimeSignature(project);
        const beatUnit = projectTimeSignature[1];
        const noteValueRatio = 4 / beatUnit;
        const secondsPerBeat = (60 / bpm) * noteValueRatio;
        const gridSize = secondsPerBeat;
        
        // 상대 시간을 절대 시간으로 변환 (마디 기준)
        const endTimeAbsolute = partStartTime + endTime;
        
        // 퀀타이즈 적용 (절대 시간 기준)
        const quantizedEndTimeAbsolute = quantizeNote(endTimeAbsolute, gridSize);
        
        // 절대 시간을 상대 시간으로 변환
        endTime = quantizedEndTimeAbsolute - partStartTime;
        
        // endTime이 startTime보다 작으면 startTime으로 설정
        if (endTime < drawingNote.startTime) {
          endTime = drawingNote.startTime;
        }
      }
      
      // 드래그 중에는 시작할 때의 note(피치)를 고정하고 endTime만 업데이트
      // 피치가 변경되면 하이라이트 업데이트 (그리기 중에는 피치가 고정되어야 하지만, 혹시 모를 경우를 대비)
      if (result.pitch !== drawingNote.note) {
        setHoveredNote(result.pitch);
      } else {
        setHoveredNote(drawingNote.note);
      }
      
      setDrawingNote({
        ...drawingNote,
        endTime,
      });
    }
    
    // Marquee 선택 중
    if (isSelecting && selectionRect) {
      setSelectionRect({
        ...selectionRect,
        endX: x,
        endY: y,
      });
    }
  }, [pianoRollRef, handleDragMouseMove, isDragging, ui, calculateLanePositions, getTimeAndPitchFromMouse, quantizeNote, partId, partNotes, bpm, timeSignature, pixelsPerSecond, initialPixelsPerSecond, setSplitPreviewX, setSplitPreviewNoteIndex, isResizingNote, selectedNotes, setHoveredResizeHandle, isDrawing, drawingNote, setDrawingNote, setHoveredNote, isSelecting, selectionRect, setSelectionRect, partStartTime]);

  useEffect(() => {
    if (!isSelecting || !selectionRect) return;
    if (marqueeSelectionSourceRef?.current !== 'pianoRoll') return;

    const handleWindowMouseMove = (event: MouseEvent) => {
      if (!pianoRollRef.current || !selectionRect) return;
      const rect = pianoRollRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
      const y = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
      setSelectionRect({ ...selectionRect, endX: x, endY: y });
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
    };
  }, [isSelecting, selectionRect, setSelectionRect, pianoRollRef, marqueeSelectionSourceRef]);

  return {
    handlePianoRollMouseMove,
  };
};

