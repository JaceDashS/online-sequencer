import { useCallback } from 'react';
import { getProject, getMidiPartNotes, splitNote } from '../store/projectStore';
import { isSplitMode, useUIState } from '../store/uiStore';
import { ticksToSecondsPure, secondsToTicksPure, ticksToMeasurePure, getPpqn, getTimeSignature } from '../utils/midiTickUtils';
import type { MidiNote } from '../types/project';
import type { AudioEngine } from '../core/audio/AudioEngine';

type UIStateType = ReturnType<typeof useUIState>;

/**
 * useMidiEditorMouseDown 훅 Props
 * Phase 7.9.3.1: 마우스 다운 핸들러를 훅으로 추출
 */
export interface UseMidiEditorMouseDownProps {
  // Refs
  pianoRollRef: React.RefObject<HTMLDivElement>;
  measureRulerRef: React.RefObject<HTMLDivElement>;
  audioEngineRef: React.RefObject<AudioEngine | null>;
  
  // States - Drawing
  isDrawing: boolean;
  setIsDrawing: (value: boolean) => void;
  drawingNote: { note: number; startTime: number; endTime?: number } | null;
  setDrawingNote: (value: { note: number; startTime: number; endTime?: number } | null) => void;
  
  // States - Selection
  isSelecting: boolean;
  setIsSelecting: (value: boolean) => void;
  selectionRect: { startX: number; startY: number; endX: number; endY: number } | null;
  setSelectionRect: (value: { startX: number; startY: number; endX: number; endY: number } | null) => void;
  selectedNotes: Set<number>;
  setSelectedNotes: (notes: Set<number>) => void;
  clickedNoteIndex: number;
  setClickedNoteIndex: (value: number) => void;
  
  // States - Resize
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
  
  // States - Split
  splitPreviewX: number | null;
  setSplitPreviewX: (value: number | null) => void;
  splitPreviewNoteIndex: number | null;
  setSplitPreviewNoteIndex: (value: number | null) => void;
  
  // Marquee Selection
  setMarqueeSelectionStart: (value: { x: number; y: number } | null) => void;
  isCtrlPressedDuringMarqueeRef: React.MutableRefObject<boolean>;
  marqueeSelectionSourceRef?: React.MutableRefObject<'pianoRoll' | 'footer' | null>;
  
  // Sustain Selection
  setSelectedSustainRange?: (value: Set<number> | ((prev: Set<number>) => Set<number>)) => void;
  
  // Data
  partId: string;
  partNotes: MidiNote[];
  setPartNotes: (notes: MidiNote[] | ((prev: MidiNote[]) => MidiNote[])) => void;
  bpm: number;
  timeSignature: [number, number];
  pixelsPerSecond: number | null;
  initialPixelsPerSecond: number;
  
  // Functions
  calculateLanePositions: () => Array<{ index: number; top: number; height: number; isBlackKey: boolean }>;
  getTimeAndPitchFromMouse: (e: React.MouseEvent | MouseEvent) => { time: number; pitch: number } | null;
  handleDragMouseDown: (x: number, y: number, items: Array<{ index: number; note: MidiNote }>, e: React.MouseEvent | MouseEvent) => void;
  cancelDrag: () => void;
  clearSelection: () => void;
  quantizeNote: (time: number, gridSize: number) => number;
  
  // UI
  ui: UIStateType;
  
  // Quantization
  partStartTime: number;
}

/**
 * useMidiEditorMouseDown 훅 반환 타입
 */
export interface UseMidiEditorMouseDownReturn {
  handlePianoRollMouseDown: (e: React.MouseEvent) => void;
}

/**
 * MIDI 에디터 마우스 다운 핸들러를 관리하는 훅
 * Phase 7.9.3.1: 마우스 다운 핸들러를 훅으로 추출
 */
export const useMidiEditorMouseDown = ({
  pianoRollRef,
  measureRulerRef,
  audioEngineRef,
  isDrawing: _isDrawing,
  setIsDrawing,
  drawingNote: _drawingNote,
  setDrawingNote,
  isSelecting: _isSelecting,
  setIsSelecting,
  selectionRect: _selectionRect,
  setSelectionRect,
  selectedNotes,
  setSelectedNotes,
  clickedNoteIndex,
  setClickedNoteIndex,
  setSelectedSustainRange,
  isResizingNote: _isResizingNote,
  setIsResizingNote,
  resizingNoteIndex: _resizingNoteIndex,
  setResizingNoteIndex,
  resizeSide: _resizeSide,
  setResizeSide,
  resizeStartPos: _resizeStartPos,
  setResizeStartPos,
  resizePreview: _resizePreview,
  setResizePreview,
  splitPreviewX: _splitPreviewX,
  setSplitPreviewX,
  splitPreviewNoteIndex: _splitPreviewNoteIndex,
  setSplitPreviewNoteIndex,
  setMarqueeSelectionStart,
  isCtrlPressedDuringMarqueeRef,
  marqueeSelectionSourceRef,
  partId,
  partNotes,
  setPartNotes,
  bpm,
  timeSignature,
  pixelsPerSecond,
  initialPixelsPerSecond,
  calculateLanePositions,
  getTimeAndPitchFromMouse,
  handleDragMouseDown,
  cancelDrag,
  clearSelection,
  quantizeNote,
  ui,
  partStartTime,
}: UseMidiEditorMouseDownProps): UseMidiEditorMouseDownReturn => {
  
  const handlePianoRollMouseDown = useCallback((e: React.MouseEvent) => {
    // 룰러 영역 클릭 무시
    if (measureRulerRef.current && measureRulerRef.current.contains(e.target as Node)) {
      return;
    }
    
    if (!pianoRollRef.current) return;
    const rect = pianoRollRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const lanes = calculateLanePositions();
    const currentPixelsPerSecond = pixelsPerSecond || initialPixelsPerSecond;

    // Ctrl + 클릭: 노트 위면 다중 선택 (빈 공간에서는 다중 선택 아님)
    if (e.ctrlKey || e.metaKey) {
      if (clickedNoteIndex >= 0) {
        // 노트 위에서 Ctrl 클릭: 다중 선택
        // 다중 선택 로직은 아래에서 처리
      }
      // 빈 공간에서 Ctrl 클릭은 아무것도 하지 않음 (Alt로 변경됨)
    }
    
    
    // 먼저 선택된 노트 확인
    const project2 = getProject();
    const part2 = project2.midiParts.find(p => p.id === partId);
    if (!part2) return;
    
    // 노트 리사이즈 감지 (오른쪽 끝 부분, 약 8픽셀 범위)
    // Split 모드가 아닐 때만 리사이즈 가능, 그리고 Split 체크보다 먼저 실행
    const RESIZE_HANDLE_WIDTH = 8;
    if (!(e.altKey || isSplitMode(ui.cursorMode))) {
      // 선택된 노트부터 확인 (선택된 노트가 우선)
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
          e.preventDefault();
          setIsResizingNote(true);
          setResizingNoteIndex(i);
          setResizeSide(isLeftResize ? 'left' : 'right');
          // Tick 기반으로 저장 (SMF 표준 정합)
          // 노트의 상대 위치 저장
          setResizeStartPos({ 
            x, 
            originalStartTick: noteStartTickRelative,
            originalDurationTicks: noteDurationTicks
          });
          // Tick 기반 미리보기 설정 (실제 리사이즈는 handleGlobalMouseMove에서 처리)
          setResizePreview({ 
            startTick: noteStartTickRelative, 
            durationTicks: noteDurationTicks 
          });
          e.stopPropagation();
          return;
        }
      }
    }
    
    // Alt 키 + 클릭 = Split (노트 위) 또는 노트 생성 (빈 레인)
    if (e.altKey || isSplitMode(ui.cursorMode)) {
      // 먼저 노트 위에서 split 처리 시도
      let foundNoteForSplit = false;
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
        const noteX = noteStartTime * currentPixelsPerSecond;
        const noteWidth = noteDuration * currentPixelsPerSecond;
        const laneIndex = note.note;
        const lane = lanes.find(l => l.index === laneIndex);
        
        if (!lane) continue;
        
        // 노트 Y 위치
        const noteY = (lane.top / 100) * rect.height;
        const noteHeight = (lane.height / 100) * rect.height;
        
        if (x >= noteX && x <= noteX + noteWidth &&
            y >= noteY && y <= noteY + noteHeight) {
          e.preventDefault();
          // Tick 기반 Split (SMF 표준 정합)
          // 클릭한 위치의 시간 계산 (파트 기준 상대)
          const clickTime = x / currentPixelsPerSecond;
          
          // 시간을 Tick으로 변환 (상대 위치)
          const project = getProject();
          const timeSignature = getTimeSignature(project);
          const ppqn = getPpqn(project);
          const tempoMap = project.timing?.tempoMap ?? [];
          let clickTickRelative = secondsToTicksPure(clickTime, 0, tempoMap, timeSignature, ppqn).startTick;
          
          // 퀀타이즈가 활성화되어 있으면 Tick 기반으로 스냅 - 프로젝트의 실제 PPQN 사용
          if (ui.isQuantizeEnabled) {
            const ticksPerBeat = getPpqn(getProject());
            clickTickRelative = Math.round(clickTickRelative / ticksPerBeat) * ticksPerBeat;
          }
          
          // 노트 내부 위치인지 확인 (상대 위치 기준)
          const noteEndTickRelative = noteStartTickRelative + noteDurationTicks;
          if (clickTickRelative > noteStartTickRelative && clickTickRelative < noteEndTickRelative) {
            // Tick을 measure로 변환 (splitNote는 measure 파라미터를 받지만 내부적으로 Tick 사용)
            const { measureStart: splitMeasurePosition } = ticksToMeasurePure(
              clickTickRelative,
              0,
              timeSignature,
              ppqn
            );
            
            // splitNote 호출 (내부적으로 Tick 기반으로 작동)
            splitNote(partId, i, splitMeasurePosition);
            setPartNotes(getMidiPartNotes(partId));
            setSplitPreviewX(null);
            setSplitPreviewNoteIndex(null);
            foundNoteForSplit = true;
          }
          return; // 노트 위에서 split 처리했으면 종료
        }
      }
      
      // 노트 위에 없으면 빈 공간에서 Alt 클릭: 노트 그리기
      if (!foundNoteForSplit) {
        const result = getTimeAndPitchFromMouse(e);
        if (!result) return;
        
        let startTime = result.time;
        
        // 퀀타이즈가 활성화되어 있으면 마디 기준으로 퀀타이즈
        if (ui.isQuantizeEnabled) {
          const project = getProject();
          const projectTimeSignature = getTimeSignature(project);
          const beatUnit = projectTimeSignature[1];
          const noteValueRatio = 4 / beatUnit;
          const secondsPerBeat = (60 / bpm) * noteValueRatio;
          const gridSize = secondsPerBeat;
          
          // 상대 시간을 절대 시간으로 변환 (마디 기준)
          const startTimeAbsolute = partStartTime + startTime;
          
          // 퀀타이즈 적용 (절대 시간 기준)
          const quantizedStartTimeAbsolute = quantizeNote(startTimeAbsolute, gridSize);
          
          // 절대 시간을 상대 시간으로 변환
          startTime = quantizedStartTimeAbsolute - partStartTime;
        }
        
        setIsDrawing(true);
        setDrawingNote({ note: result.pitch, startTime });
        return;
      }
    }
    
    // 클릭한 노트 찾기
    let foundClickedNoteIndex = -1;
    
    for (let i = partNotes.length - 1; i >= 0; i--) {
      const note = partNotes[i];
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
      const noteX = noteStartTime * currentPixelsPerSecond;
      const noteWidth = noteDuration * currentPixelsPerSecond;
      const laneIndex = note.note;
      const lane = lanes.find(l => l.index === laneIndex);
      
      if (!lane) continue;
      
      const noteY = (lane.top / 100) * rect.height;
      const noteHeight = (lane.height / 100) * rect.height;
      
      if (x >= noteX && x <= noteX + noteWidth &&
          y >= noteY && y <= noteY + noteHeight) {
        foundClickedNoteIndex = i;
        break;
      }
    }
    
    if (foundClickedNoteIndex >= 0) {
      
      // 노트 선택 (useNoteSelection 훅 사용, merge 모드 등 기존 로직 유지)
      const isMergeMode = ui.cursorMode === 'mergeByKey4';
      
      // 커스텀 선택 로직: merge 모드와 기존 로직을 유지
      const customSelectionLogic = (clickedIndex: number, currentSelection: Set<number>, event: React.MouseEvent | MouseEvent) => {
        const isCtrlPressed = 'ctrlKey' in event && (event.ctrlKey || event.metaKey);
        
        if (isMergeMode) {
          // Merge 모드에서 Ctrl 키가 눌려있으면 일반 모드처럼 다중 선택
          if (isCtrlPressed) {
            // 이미 선택된 노트를 Ctrl + 클릭하면 선택 유지
            if (currentSelection.has(clickedIndex)) {
              return currentSelection; // 선택 유지
            }
            // 다중 선택: 기존 선택에 추가
            return new Set([...currentSelection, clickedIndex]);
          } else {
            // Merge 모드에서 Ctrl 없이 클릭 시: 이미 선택된 노트면 선택 유지 (보통 커서처럼)
            if (currentSelection.has(clickedIndex)) {
              return currentSelection; // 선택 유지 (보통 커서처럼 동작)
            }
            // Merge 모드에서 Ctrl 없이 새 노트 클릭: 단일 선택 (다중 선택 아님)
            return new Set([clickedIndex]);
          }
        } else {
          // 일반 모드: Ctrl 키가 있으면 기존 선택에 추가, 없으면 새로 선택
          // 이미 선택된 노트를 클릭하면 선택 유지
          if (currentSelection.has(clickedIndex) && !isCtrlPressed) {
            return currentSelection; // 선택 유지
          }
          
          if (isCtrlPressed) {
            // 다중 선택: 기존 선택에 추가
            return new Set([...currentSelection, clickedIndex]);
          } else {
            // 단일 선택: 새로 선택
            return new Set([clickedIndex]);
          }
        }
      };
      
      // 새로운 선택 계산 (즉시 사용하기 위해)
      const updatedSelectedNotes = customSelectionLogic(foundClickedNoteIndex, selectedNotes, e);
      
      // useNoteSelection 훅의 setSelectedNotes를 사용하여 선택 업데이트
      setSelectedNotes(updatedSelectedNotes);
      // 서스테인 선택 해제
      if (setSelectedSustainRange) {
        setSelectedSustainRange(new Set());
      }
      
      const selectedNoteData = Array.from(updatedSelectedNotes)
        .filter(index => index < partNotes.length)
        .map(index => ({ index, note: partNotes[index] }));
      
      // Ctrl 키가 눌려있는지 확인
      const isCtrlPressed = e.ctrlKey || e.metaKey;
      
      // Merge 모드에서는 Ctrl 여부와 관계없이 드래그를 시작하지 않음 (다중 선택만 수행)
      const shouldStartDrag = !isMergeMode;
      
      if (shouldStartDrag) {
        // Ctrl 키가 눌려있으면 duplicate 모드 활성화 (useNoteDrag에서 처리되므로, 여기서는 UI 상태만 업데이트)
        if (isCtrlPressed) {
          ui.setDuplicateModeActive(true);
        }
        
        // 선택만 하고, 잠재적 드래그 시작 위치 저장 (useNoteDrag 훅 사용)
        handleDragMouseDown(x, y, selectedNoteData, e);
      } else {
        // Merge 모드에서는 드래그를 시작하지 않고 선택만 수행
        cancelDrag(); // 기존 잠재적 드래그 취소
      }
      
      setClickedNoteIndex(foundClickedNoteIndex);
      
      // 노트 선택 시 사운드 피드백 (모든 선택된 노트의 소리 재생)
      if (updatedSelectedNotes.size > 0 && audioEngineRef.current) {
        // Merge 모드에서 이미 선택된 노트를 클릭한 경우 (선택 유지)
        const isMergeModeAndSameSelection = isMergeMode && 
          updatedSelectedNotes.size === selectedNotes.size && 
          Array.from(updatedSelectedNotes).every(index => selectedNotes.has(index));
        
        // 이전 선택된 노트들과 새로운 선택의 차이를 계산하여 새로 추가된 노트만 소리 재생
        const newlySelectedNotes = Array.from(updatedSelectedNotes).filter(
          index => !selectedNotes.has(index) && index < partNotes.length
        );
        
        // Get track instrument for preview
        const project2 = getProject();
        const part2 = project2.midiParts.find(p => p.id === partId);
        const track2 = part2 ? project2.tracks.find(t => t.id === part2.trackId) : null;
        const instrument = track2?.instrument || 'piano';
        
        // Merge 모드에서 이미 선택된 노트를 클릭한 경우: 해당 노트의 소리 재생
        if (isMergeModeAndSameSelection && updatedSelectedNotes.has(foundClickedNoteIndex)) {
          const clickedNote = partNotes[foundClickedNoteIndex];
          if (clickedNote) {
            void audioEngineRef.current.previewNote(clickedNote.note, clickedNote.velocity ?? 100, instrument);
          }
        } else if (newlySelectedNotes.length > 0) {
          // 새로 추가된 노트들의 소리 재생
          newlySelectedNotes.forEach(noteIndex => {
            const note = partNotes[noteIndex];
            if (note) {
              void audioEngineRef.current?.previewNote(note.note, note.velocity ?? 100, instrument);
            }
          });
        } else if (updatedSelectedNotes.size === 1) {
          // 단일 선택 시 해당 노트의 소리 재생
          const singleSelectedNote = partNotes[Array.from(updatedSelectedNotes)[0]];
          if (singleSelectedNote) {
            void audioEngineRef.current.previewNote(singleSelectedNote.note, singleSelectedNote.velocity ?? 100, instrument);
          }
        }
      }
      
      e.stopPropagation();
      return;
    }
    
    // 일반 드래그: Marquee Selection
    
    // Ctrl 키 상태 저장 (마우스업 시 기존 선택에 추가하기 위해)
    const isCtrlPressed = e.ctrlKey || e.metaKey;
    isCtrlPressedDuringMarqueeRef.current = isCtrlPressed;
    
    // 피아노 롤에서 마키 선택 시작 표시
    if (marqueeSelectionSourceRef) {
      marqueeSelectionSourceRef.current = 'pianoRoll';
    }
    
    setIsSelecting(true);
    setMarqueeSelectionStart({ x, y }); // Marquee 선택을 위해 별도 상태 사용
    setSelectionRect({ startX: x, startY: y, endX: x, endY: y });
    
    // 빈 공간 클릭 시 선택 해제 및 잠재적 드래그 초기화
    // Ctrl 키가 눌려있으면 기존 선택 유지 (마키 선택 완료 시 추가될 예정)
    if (!isCtrlPressed) {
      clearSelection(); // useNoteSelection 훅의 clearSelection 사용
    }
    cancelDrag(); // useNoteDrag 훅의 cancelDrag 사용
  }, [calculateLanePositions, getTimeAndPitchFromMouse, pixelsPerSecond, initialPixelsPerSecond, clickedNoteIndex, selectedNotes, setSelectedNotes, partNotes, partId, bpm, timeSignature, ui, clearSelection, handleDragMouseDown, cancelDrag, measureRulerRef, pianoRollRef, setIsDrawing, setDrawingNote, setIsResizingNote, setResizingNoteIndex, setResizeSide, setResizeStartPos, setResizePreview, setPartNotes, setSplitPreviewX, setSplitPreviewNoteIndex, setClickedNoteIndex, audioEngineRef, setIsSelecting, setMarqueeSelectionStart, setSelectionRect, isCtrlPressedDuringMarqueeRef, marqueeSelectionSourceRef]);

  return {
    handlePianoRollMouseDown,
  };
};

