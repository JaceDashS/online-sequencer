import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import styles from './MidiEditor.module.css';
import { subscribeToProjectChanges, getMidiPartNotes } from '../../store/projectStore';
import { getProject, findMidiPartById } from '../../store/projectState';
import { selectProject } from '../../store/selectors';
import { updateNoteInMidiPart } from '../../store/actions/noteActions';
// getRenderableNoteRange는 Tick 기반으로 직접 계산하므로 제거 (SMF 표준 정합)
import { useUIState, isSplitMode } from '../../store/uiStore';
import { useCursorModeKeyboard } from '../../hooks/useCursorModeKeyboard';
import { useNoteSelection } from '../../hooks/useNoteSelection';
import { useNoteDrag } from '../../hooks/useNoteDrag';
import { useMidiEditorData } from '../../hooks/useMidiEditorData';
import { useMidiEditorKeyboardShortcuts } from '../../hooks/useMidiEditorKeyboardShortcuts';
import { useMidiEditorZoom } from '../../hooks/useMidiEditorZoom';
import { useMidiEditorMouseDown } from '../../hooks/useMidiEditorMouseDown';
import { useMidiEditorMouseMove } from '../../hooks/useMidiEditorMouseMove';
import { useMidiEditorMouseUp } from '../../hooks/useMidiEditorMouseUp';
import { useMidiEditorDoubleClick } from '../../hooks/useMidiEditorDoubleClick';
import { useSustainPedal } from '../../hooks/useSustainPedal';
import { useNoteResize } from '../../hooks/useNoteResize';
import { useMidiEditorScrollSync } from '../../hooks/useMidiEditorScrollSync';
import { usePlaybackTime } from '../../hooks/usePlaybackTime';
import { MIDI_EDITOR_CONSTANTS } from '../../constants/ui';
import type { MidiNote } from '../../types/project';
import PianoOctave from './PianoOctave';
import MeasureRuler from '../EventDisplay/MeasureRuler';
import { EditorHeader } from './EditorHeader';
import { PianoRoll } from './PianoRoll';
import { EditorFooter } from './EditorFooter';
import { ticksToSecondsPure, getPpqn, getTimeSignature } from '../../utils/midiTickUtils';
import { AudioEngine } from '../../core/audio/AudioEngine';
import type { MidiEditorProps } from './MidiEditorTypes';
import { VIEWPORT_OVERSCAN_SECONDS } from './MidiEditorTypes';
import {
  clampPianoPitch,
  noteNameToMidiNote,
  getVelocityColor,
  getVelocityBorderColor,
  calculateLanePositions as calculateLanePositionsPure,
  quantizeNote
} from './MidiEditorCalculations';

const MidiEditor: React.FC<MidiEditorProps> = ({ partId, onClose, bpm, timeSignature, pixelsPerSecond: initialPixelsPerSecond }) => {
  
  const ui = useUIState();

  // AudioEngine for preview playback
  const audioEngineRef = useRef<AudioEngine | null>(null);
  useEffect(() => {
    audioEngineRef.current = new AudioEngine();
    return () => {
      // Cleanup on unmount: dispose all audio resources
      if (audioEngineRef.current) {
        void audioEngineRef.current.dispose();
        audioEngineRef.current = null;
      }
    };
  }, []);

  // 계산 함수는 MidiEditorCalculations.ts에서 import

  // Handle piano key click for preview
  const handlePianoKeyClick = useCallback((noteName: string, octave: number) => {
    const midiNote = noteNameToMidiNote(noteName, octave);
    
    if (audioEngineRef.current) {
      // Get track instrument from part
      const part = findMidiPartById(partId);
      const project = getProject();
      const track = part ? project.tracks.find(t => t.id === part.trackId) : null;
      const instrument = track?.instrument || 'piano';
      
      void audioEngineRef.current.previewNote(midiNote, 100, instrument);
    }
  }, [noteNameToMidiNote, partId]);

  // Handle piano key release (stop preview)
  const handlePianoKeyRelease = useCallback((noteName: string, octave: number) => {
    const midiNote = noteNameToMidiNote(noteName, octave);
    if (audioEngineRef.current) {
      audioEngineRef.current.stopPreview(midiNote);
    }
  }, [noteNameToMidiNote]);

  // 벨로시티 색상 계산 함수는 MidiEditorCalculations.ts에서 import
  
  const [visibleTimeRange, setVisibleTimeRange] = useState({ start: 0, end: 0 });
  const scrollRafRef = useRef<number | null>(null);
  
  // 건반 높이 스케일 (0.5~2.0, 기본값 1.0)
  const [pianoKeyHeightScale, setPianoKeyHeightScale] = useState<number>(MIDI_EDITOR_CONSTANTS.PIANO_KEY_HEIGHT_SCALE_DEFAULT);
  
  // 재생 위치 (현재는 0, 나중에 실제 재생 위치로 업데이트)
  const currentPlaybackTime = usePlaybackTime();
  
  const pianoRollRef = useRef<HTMLDivElement>(null);
  const measureRulerRef = useRef<HTMLDivElement>(null);
  const editorContentRef = useRef<HTMLDivElement>(null);
  const pianoRollContainerRef = useRef<HTMLDivElement>(null);
  const lastProgrammaticScrollLeftRef = useRef<number | null>(null); // momentum scrolling 차단을 위한 추적 값
  const momentumBlockTimeoutRef = useRef<number | null>(null); // momentum scrolling 차단 타임아웃
  const momentumBlockRafRef = useRef<number | null>(null); // momentum scrolling 차단 requestAnimationFrame
  const pianoKeysRef = useRef<HTMLDivElement>(null);
  const velocityDisplayRef = useRef<HTMLDivElement>(null);
  const velocityGraphAreaRef = useRef<HTMLDivElement>(null);
  // partNotes는 useMidiEditorData에서 관리하되, 기존 setPartNotes 호출을 위해 별도 상태로 유지
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingNote, setDrawingNote] = useState<{ note: number; startTime: number; endTime?: number } | null>(null);
  
  // 선택 관련 상태 (useNoteSelection 훅 사용)
  const {
    selectedNotes,
    setSelectedNotes,
    clearSelection,
  } = useNoteSelection();
  
  // Marquee Selection 관련 상태 (기존 로직 유지)
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionRect, setSelectionRect] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null);
  // Marquee Selection 시작 위치 (향후 사용 예정)
  const [_marqueeSelectionStart, setMarqueeSelectionStart] = useState<{ x: number; y: number } | null>(null);
  // Marquee Selection 시작 시 Ctrl 키 상태 저장 (마우스업 시 기존 선택에 추가하기 위해)
  const isCtrlPressedDuringMarqueeRef = useRef<boolean>(false);
  // Marquee Selection이 푸터에서 시작되었는지 추적
  const marqueeSelectionSourceRef = useRef<'pianoRoll' | 'footer' | null>(null);
  
  // 호버 관련 상태 (호버된 레인의 MIDI 노트 번호)
  const [hoveredNote, setHoveredNote] = useState<number | null>(null);
  const [hoveredResizeHandle, setHoveredResizeHandle] = useState<number | null>(null); // 리사이즈 핸들을 호버한 노트 인덱스
  
  // 드래그 중 피치 변경 추적 (사운드 피드백용)
  // 각 노트별로 마지막으로 재생한 피치를 추적 (노트 인덱스 -> 마지막 재생 피치)
  const lastPreviewedPitchesRef = useRef<Map<number, number>>(new Map());
  
  // Split 모드 관련 상태
  const prevAltPressedRef = useRef(false);
  const [splitPreviewX, setSplitPreviewX] = useState<number | null>(null); // 자를 위치 미리보기 X 좌표
  const [splitPreviewNoteIndex, setSplitPreviewNoteIndex] = useState<number | null>(null);
  const [isDraggingRulerPlayhead, setIsDraggingRulerPlayhead] = useState(false); // 미리보기가 표시되는 노트 인덱스

  // 커서 모드 키보드 핸들러
  useCursorModeKeyboard({
    onSplitModeDeactivate: () => {
      setSplitPreviewX(null);
      setSplitPreviewNoteIndex(null);
    },
    onAltKeyPress: () => {
      prevAltPressedRef.current = true;
    },
    shouldActivateSplitOnAlt: true,
    stopPropagation: true,
  });
  
  // 드래그 관련 상태 (useNoteDrag 훅 사용)
  // 드래그 오프셋 (time, pitch) - 기존 로직 유지
  const [dragOffset, setDragOffset] = useState<{ time: number; pitch: number }>({ time: 0, pitch: 0 });
  const dragStartPitchRef = useRef<number | null>(null); // 드래그 시작 시점의 피치
  
  // useNoteDrag 훅 사용 (x, y 오프셋은 훅에서 관리, time/pitch 오프셋은 기존 로직 유지)
  const {
    isDragging,
    dragStartPos,
    dragStartItems: dragStartNotes,
    isCtrlPressedDuringDrag,
    handleMouseDown: handleDragMouseDown,
    handleMouseMove: handleDragMouseMove,
    handleMouseUp: handleDragMouseUp,
    cancelDrag,
  } = useNoteDrag<{ index: number; note: MidiNote }>({
    dragThreshold: 3,
    onDragStart: (startPos, items) => {
      // 드래그 시작 시 피치 계산 및 사운드 피드백 초기화 (기존 로직 유지)
      if (pianoRollRef.current && items.length > 0) {
        const rect = pianoRollRef.current.getBoundingClientRect();
        const startMouseEvent = {
          clientX: startPos.x + rect.left,
          clientY: startPos.y + rect.top,
        } as MouseEvent;
        const startResult = getTimeAndPitchFromMouse(startMouseEvent);
        dragStartPitchRef.current = startResult?.pitch ?? null;
        
        // 드래그 시작 시 경로 추적 상태 초기화
        lastPreviewedPitchesRef.current.clear();
      }
    },
    onDragMove: (offset, items) => {
      // x, y 오프셋을 time, pitch 오프셋으로 변환 (기존 로직 유지)
      if (!pianoRollRef.current || !dragStartPos || items.length === 0 || dragStartPitchRef.current === null) {
        return;
      }
      
      const currentPixelsPerSecond = pixelsPerSecond || initialPixelsPerSecond;
      let deltaSeconds = (offset.x ?? 0) / currentPixelsPerSecond;
      
      // 퀀타이즈가 활성화되어 있으면 드래그 오프셋도 퀀타이즈
      if (ui.isQuantizeEnabled && items.length > 0) {
        const project = getProject();
        const projectTimeSignature = getTimeSignature(project);
        const ppqn = getPpqn(project);
        const tempoMap = project.timing?.tempoMap ?? [];
        
        // 드래그 시작 노트의 원본 위치 (첫 번째 노트 기준)
        const firstOriginalNote = items[0].note;
        const originalStartTick = firstOriginalNote.startTick ?? 0;
        
        // 원본 노트의 상대 시간
        const { startTime: originalStartTimeRelative } = ticksToSecondsPure(originalStartTick, 0, tempoMap, projectTimeSignature, ppqn);
        
        // 새로운 위치의 상대 시간 (원본 + 델타)
        const newStartTimeRelative = originalStartTimeRelative + deltaSeconds;
        
        // 상대 시간을 절대 시간으로 변환 (마디 기준)
        const newStartTimeAbsolute = partStartTime + newStartTimeRelative;
        
        // 퀀타이즈 적용 (절대 시간 기준)
        const beatUnit = projectTimeSignature[1];
        const noteValueRatio = 4 / beatUnit;
        const secondsPerBeat = (60 / bpm) * noteValueRatio;
        const gridSize = secondsPerBeat;
        const quantizedStartTimeAbsolute = quantizeNote(newStartTimeAbsolute, gridSize);
        
        // 절대 시간을 상대 시간으로 변환
        const quantizedStartTimeRelative = quantizedStartTimeAbsolute - partStartTime;
        
        // 델타를 퀀타이즈된 값으로 업데이트
        deltaSeconds = quantizedStartTimeRelative - originalStartTimeRelative;
      }
      
      // 현재 마우스 위치 계산
      const rect = pianoRollRef.current.getBoundingClientRect();
      const currentX = dragStartPos.x + (offset.x ?? 0);
      const currentY = dragStartPos.y + (offset.y ?? 0);
      const currentMouseEvent = {
        clientX: currentX + rect.left,
        clientY: currentY + rect.top,
      } as MouseEvent;
      
      // 현재 피치 계산
      const currentResult = getTimeAndPitchFromMouse(currentMouseEvent);
      if (!currentResult) {
        return;
      }
      
      // 피치 델타 계산
      const deltaPitch = currentResult.pitch - dragStartPitchRef.current;
      setDragOffset({ time: deltaSeconds, pitch: deltaPitch });
      
      // 드래그 중 피치 변경 시 사운드 피드백 (기존 로직 유지)
      if (items.length > 0 && audioEngineRef.current) {
        items.forEach(({ note: originalNote, index: originalIndex }) => {
          const newPitch = Math.max(0, Math.min(127, originalNote.note + deltaPitch));
          const lastPitch = lastPreviewedPitchesRef.current.get(originalIndex);
          
          if (newPitch !== lastPitch && audioEngineRef.current) {
            // Get track instrument for preview
            const part = findMidiPartById(partId);
            const project = getProject();
            const track = part ? project.tracks.find(t => t.id === part.trackId) : null;
            const instrument = track?.instrument || 'piano';
            
            if (lastPitch !== undefined) {
              audioEngineRef.current.stopPreview(lastPitch);
            }
            void audioEngineRef.current.previewNote(newPitch, originalNote.velocity ?? 100, instrument);
            lastPreviewedPitchesRef.current.set(originalIndex, newPitch);
          }
        });
      }
      
      // 드래그 중 피아노 키 하이라이트 업데이트 (기존 로직 유지)
      if (items.length > 0) {
        const firstNote = items[0].note;
        const newPitch = Math.max(0, Math.min(127, firstNote.note + deltaPitch));
        setHoveredNote(newPitch);
      }
    },
    onDragEnd: () => {
      // 드래그 종료 시 오프셋 초기화
      setDragOffset({ time: 0, pitch: 0 });
      dragStartPitchRef.current = null;
    },
  });
  
  // 클릭한 노트의 인덱스 (여러 노트 드래그 시 그립 위치 유지용)
  const [clickedNoteIndex, setClickedNoteIndex] = useState<number>(MIDI_EDITOR_CONSTANTS.INITIAL_CLICKED_NOTE_INDEX);

  // 벨로시티 조정 관련 상태
  const [isAdjustingVelocity, setIsAdjustingVelocity] = useState(false);
  const [adjustingVelocityNoteIndex, setAdjustingVelocityNoteIndex] = useState<number>(-1);
  const [velocityAdjustStartPos, setVelocityAdjustStartPos] = useState<{ y: number; originalVelocity: number } | null>(null);
  // 미리보기 벨로시티 (드래그 중 UI 업데이트용, 실제 데이터는 드롭 시에만 업데이트)
  const [previewVelocity, setPreviewVelocity] = useState<{ noteIndex: number; velocity: number } | null>(null);
  
  // 서스테인 페달 조정 관련 상태
  
  // 벨로시티/서스테인 탭 선택 상태 (전체 공통)
  const [velocityTabSelection, setVelocityTabSelection] = useState<'velocity' | 'sustain'>('velocity');
  // 빨간색 테마 활성화 여부 (v 키로 토글, 선택된 노트와 푸터 벨로시티 바에 적용)
  const [isRedThemeActive, setIsRedThemeActive] = useState(false);
  
  // 선택된 노트가 없으면 빨간색 테마 자동 비활성화
  useEffect(() => {
    if (selectedNotes.size === 0 && isRedThemeActive) {
      setIsRedThemeActive(false);
    }
  }, [selectedNotes, isRedThemeActive]);
  
  // 줌 범위 설정
  const MAX_ZOOM = MIDI_EDITOR_CONSTANTS.MAX_ZOOM;
  
  // useMidiEditorData 훅 사용 (데이터 레이어 분리, 기존 로직 유지)
  // visibleTimeRange는 스크롤 위치에 따라 동적으로 변경되므로 전달
  const {
    part,
    partDuration,
    partNotes: dataPartNotes,
    refreshNotes: refreshDataNotes,
    sustainRanges,
    visibleNotes: dataVisibleNotes,
  } = useMidiEditorData(partId, {
    viewportStartTime: visibleTimeRange.start,
    viewportEndTime: visibleTimeRange.end,
    bpm,
    timeSignature,
  });

  // useMidiEditorData의 partNotes를 직접 사용 (프로젝트 변경 이벤트를 통해 자동 업데이트됨)
  // 문제: setPartNotes(getMidiPartNotes(partId)) 호출 시 useMidiEditorData가 업데이트되지 않음
  // 해결: setPartNotes 호출 시 refreshDataNotes()도 호출하여 즉시 동기화
  const [localPartNotes, setLocalPartNotes] = useState<MidiNote[]>(dataPartNotes);
  
  // useMidiEditorData의 partNotes를 우선 사용 (프로젝트 변경 이벤트를 통해 자동 업데이트됨)
  // 하지만 즉시 반영이 필요한 경우를 위해 로컬 상태도 유지
  const partNotes = dataPartNotes.length > 0 ? dataPartNotes : localPartNotes;
  
  // setPartNotes 래퍼: 로컬 상태 업데이트 + useMidiEditorData 새로고침
  const setPartNotes = useCallback((notes: MidiNote[] | ((prev: MidiNote[]) => MidiNote[])) => {
    const currentNotes = dataPartNotes.length > 0 ? dataPartNotes : localPartNotes;
    const newNotes = typeof notes === 'function' ? notes(currentNotes) : notes;
    setLocalPartNotes(newNotes);
    // useMidiEditorData 강제 새로고침 (프로젝트 변경 이벤트 대기하지 않고 즉시 반영)
    refreshDataNotes();
  }, [dataPartNotes, localPartNotes, refreshDataNotes]);
  
  // useMidiEditorData의 partNotes와 동기화
  useEffect(() => {
    const dataStr = JSON.stringify(dataPartNotes);
    const localStr = JSON.stringify(localPartNotes);
    if (dataStr !== localStr) {
      setLocalPartNotes(dataPartNotes);
    }
  }, [dataPartNotes]);


  const adjustSelectedVelocities = useCallback((delta: number) => {
    if (selectedNotes.size === 0) return;

    // NOTE: visibleNotes는 대부분 store 기반(dataPartNotes)로 렌더되므로,
    // 로컬 setPartNotes + refreshDataNotes() 조합은 변경을 즉시 덮어쓸 수 있음.
    // 따라서 store를 직접 업데이트하여 UI와 데이터를 일치시킴.
    const storeNotes = getMidiPartNotes(partId);
    const currentNotes = storeNotes.length > 0 ? storeNotes : partNotes;
    selectedNotes.forEach((index) => {
      if (index < 0 || index >= currentNotes.length) return;
      const base = currentNotes[index]?.velocity ?? 100;
      const next = Math.max(0, Math.min(127, base + delta));
      updateNoteInMidiPart(partId, index, { velocity: next }, true);
    });
  }, [partId, partNotes, selectedNotes]);

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (!isRedThemeActive) return;
      if (selectedNotes.size === 0) return;
      if (e.deltaY === 0) return;
      e.preventDefault();
      adjustSelectedVelocities(e.deltaY > 0 ? -4 : 4);
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      window.removeEventListener('wheel', handleWheel);
    };
  }, [isRedThemeActive, selectedNotes, adjustSelectedVelocities]);


  // Step 7.9.2: 줌 계산 로직을 훅으로 추출
  const {
    pixelsPerSecond,
    setPixelsPerSecond,
    setHasUserAdjustedZoom,
    isCalculatingZoom,
    isContainerReady,
    minZoom,
  } = useMidiEditorZoom({
    part: part ?? null,
    partDuration,
    initialPixelsPerSecond,
    pianoRollContainerRef,
  });

  
  // Step 7.9.5: 노트 리사이즈 로직을 훅으로 추출
  const {
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
  } = useNoteResize({
    partId,
    bpm,
    timeSignature,
    pixelsPerSecond,
    initialPixelsPerSecond,
    pianoRollRef: pianoRollRef as React.RefObject<HTMLDivElement>,
    isQuantizeEnabled: ui.isQuantizeEnabled,
    setPartNotes,
  });
  
  // 프로젝트 변경 구독 (midiPart 변경 시 파트 확인 및 trackId 변경 감지)
  // 기존 로직 유지: useMidiEditorData에서 프로젝트 변경 구독을 하지만, 
  // trackId 변경 감지는 추가 로직이 필요하므로 별도로 처리
  useEffect(() => {
    const unsubscribe = subscribeToProjectChanges((event) => {
      if (event.type === 'midiPart' && event.partId === partId) {
        // 파트의 trackId가 변경되었는지 확인 (기존 로직 유지)
        const updatedPart = findMidiPartById(partId);
        if (updatedPart && partTrackIdRef.current !== null && updatedPart.trackId !== partTrackIdRef.current) {
          // 트랙이 변경되었으면 에디터 닫기
          onCloseRef.current();
          return;
        }
        
        // undo/redo 등으로 파트가 변경되었을 때 partNotes 업데이트
        // useMidiEditorData가 이미 처리하므로, 여기서는 로컬 상태만 동기화
        refreshDataNotes();
      }
    });
    return unsubscribe;
  }, [partId, refreshDataNotes]);

  // Step 7.9.4: 서스테인 페달 관련 useEffect는 useSustainPedal 훅 내부로 이동됨

  // noteTimings? visibleNotes? useMidiEditorData?? ????, 
  // visibleTimeRange? ???? ????? ?? ??? ?? (?? ???)
  const noteTimings = useMemo(() => {
    const project = getProject();
    const timeSignature = getTimeSignature(project);
    const ppqn = getPpqn(project);
    const tempoMap = project.timing?.tempoMap ?? [];
    return partNotes.map((note) => {
      const { startTime, duration } = ticksToSecondsPure(
        note.startTick,
        note.durationTicks ?? 0,
        tempoMap,
        timeSignature,
        ppqn
      );
      return { startTime, duration };
    });
  }, [partNotes, bpm, timeSignature]);

  // Step 7.9.4: ???? ?? ?? useEffect? useSustainPedal ? ??? ???
  // 파트의 글로벌 시작 시간 계산 (마디 기준 퀀타이즈용)
  const partStartTime = useMemo(() => {
    if (!part) return 0;
    const project = getProject();
    const projectTimeSignature = getTimeSignature(project);
    const ppqn = getPpqn(project);
    const tempoMap = project.timing?.tempoMap ?? [];
    const { startTime } = ticksToSecondsPure(
      part.startTick,
      part.durationTicks,
      tempoMap,
      projectTimeSignature,
      ppqn
    );
    return startTime;
  }, [part]);
  
  const {
    isDrawingSustain,
    setIsDrawingSustain,
    drawingSustain,
    setDrawingSustain,
    selectedSustainRange,
    setSelectedSustainRange,
    isDraggingSustainRange,
    setIsDraggingSustainRange,
    sustainDragStart,
    setSustainDragStart,
    sustainDragPreview,
    setSustainDragPreview,
    isResizingSustainRange,
    setIsResizingSustainRange,
    sustainResizeStart,
    setSustainResizeStart,
    sustainResizePreview,
    setSustainResizePreview,
    displayedSustainRanges,
    updateSustainControlChanges,
  } = useSustainPedal({
    partId,
    bpm,
    timeSignature,
    partDuration,
    sustainRanges,
    pixelsPerSecond,
    initialPixelsPerSecond,
    part: part ?? null,
    velocityGraphAreaRef,
    isQuantizeEnabled: ui.isQuantizeEnabled,
    quantizeNote,
    partStartTime,
  });

  // 기존 서스테인 페달의 value를 64로 정규화 (컴포넌트 마운트 시 한 번만 실행)
  const hasNormalizedRef = useRef(false);
  useEffect(() => {
    if (!part?.controlChanges || !updateSustainControlChanges || hasNormalizedRef.current) return;
    
    // 기존 CC64 이벤트의 value가 64보다 큰지 확인
    const hasNonNormalizedValue = part.controlChanges.some(
      cc => cc.controller === 64 && (cc.value ?? 0) > 64
    );
    
    // value가 64보다 크면 정규화
    if (hasNonNormalizedValue && sustainRanges.length > 0) {
      hasNormalizedRef.current = true;
      updateSustainControlChanges(sustainRanges, selectedSustainRange);
    }
  }, [part, partId, sustainRanges, selectedSustainRange, updateSustainControlChanges]);

  const visibleNotes = useMemo(() => {
    const useDataVisible = dataVisibleNotes.length > 0 && dataVisibleNotes.length === partNotes.length;
    if (useDataVisible) {
      return dataVisibleNotes;
    }
    const start = Math.max(0, visibleTimeRange.start - VIEWPORT_OVERSCAN_SECONDS);
    const end = visibleTimeRange.end + VIEWPORT_OVERSCAN_SECONDS;
    const results: Array<{ note: MidiNote; index: number; startTime: number; duration: number }> = [];

    for (let i = 0; i < partNotes.length; i++) {
      const timing = noteTimings[i];
      if (!timing) continue;
      const noteEnd = timing.startTime + timing.duration;
      if (noteEnd < start || timing.startTime > end) {
        continue;
      }
      results.push({ note: partNotes[i], index: i, startTime: timing.startTime, duration: timing.duration });
    }

    return results;
  }, [dataVisibleNotes, partNotes, noteTimings, visibleTimeRange]);

  // 컨텐츠 너비 계산 (여러 곳에서 사용)
  const contentWidth = useMemo(() => {
    return partDuration * (pixelsPerSecond || initialPixelsPerSecond);
  }, [partDuration, pixelsPerSecond, initialPixelsPerSecond]);

  const updateVisibleRange = useCallback(() => {
    const container = pianoRollContainerRef.current;
    const currentPixelsPerSecond = pixelsPerSecond || initialPixelsPerSecond;

    if (!container || !Number.isFinite(currentPixelsPerSecond) || currentPixelsPerSecond <= 0) {
      setVisibleTimeRange({ start: 0, end: partDuration });
      return;
    }

    const start = container.scrollLeft / currentPixelsPerSecond;
    const end = (container.scrollLeft + container.clientWidth) / currentPixelsPerSecond;
    setVisibleTimeRange({ start, end });
  }, [pixelsPerSecond, initialPixelsPerSecond, partDuration]);


  const scheduleVisibleRangeUpdate = useCallback(() => {
    if (scrollRafRef.current !== null) return;
    if (typeof requestAnimationFrame === 'function') {
      scrollRafRef.current = requestAnimationFrame(() => {
        scrollRafRef.current = null;
        updateVisibleRange();
      });
    } else {
      scrollRafRef.current = window.setTimeout(() => {
        scrollRafRef.current = null;
        updateVisibleRange();
      }, 0);
    }
  }, [updateVisibleRange]);

  useEffect(() => {
    updateVisibleRange();
  }, [updateVisibleRange]);

  // Step 7.9.6: 스크롤 동기화 로직을 훅으로 추출
  useMidiEditorScrollSync({
    pianoRollContainerRef,
    measureRulerRef,
    pianoKeysRef,
    velocityGraphAreaRef,
    lastProgrammaticScrollLeftRef,
    scheduleVisibleRangeUpdate,
  });

  // Step 7.9.6: 스크롤 동기화 관련 useEffect는 useMidiEditorScrollSync 훅 내부로 이동됨
  
  // 파트의 trackId 추적 (트랙 변경 감지용)
  const partTrackIdRef = useRef<string | null>(null);
  const onCloseRef = useRef(onClose);
  
  // onClose ref 업데이트 (dependency 문제 회피)
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  
  // 파트의 trackId 초기화 (별도 useEffect로 분리)
  useEffect(() => {
    if (part) {
      partTrackIdRef.current = part.trackId;
    }
  }, [part]);
  
  // 미디파트가 없거나 트랙이 변경되면 경고하고 닫기 (폭 계산이 완료된 후에만)
  useEffect(() => {
    if (!part && !isCalculatingZoom) {
      // 약간의 지연 후 닫기 (렌더링이 완료된 후)
      const timer = setTimeout(() => {
        onCloseRef.current();
      }, 100);
      return () => clearTimeout(timer);
    }
    
    // 파트의 trackId가 변경되었는지 확인
    if (part && partTrackIdRef.current !== null && partTrackIdRef.current !== part.trackId) {
      // 트랙이 변경되었으면 에디터 닫기
      const timer = setTimeout(() => {
        onCloseRef.current();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [part, partId, isCalculatingZoom]);
  
  // 키보드 단축키 핸들러 (모든 hooks는 early return 전에 선언되어야 함)
  // merge 모드일 때 커서를 마름모로 변경
  useEffect(() => {



    if (ui.cursorMode === 'mergeByKey4') {
      // 마름모 커서를 위한 SVG 데이터 URL 생성
      const svg = `
        <svg width="24" height="24" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2 L22 12 L12 22 L2 12 Z" fill="black" stroke="white" stroke-width="1"/>
        </svg>
      `;
      const svgBlob = new Blob([svg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(svgBlob);
      const cursorStyle = `url(${url}) 12 12, crosshair`;
      



      document.body.style.cursor = cursorStyle;
      return () => {
        document.body.style.cursor = '';
        URL.revokeObjectURL(url);
      };
    } else {
      // merge 모드가 비활성화되면 커서 초기화
      document.body.style.cursor = '';
    }
  }, [ui.cursorMode]);

  // Step 7.9.1: 키보드 단축키 핸들러를 훅으로 추출
  useMidiEditorKeyboardShortcuts({
    partId,
    selectedNotes,
    setSelectedNotes,
    timeSignature,
    velocityTabSelection,
    selectedSustainRange,
    sustainRanges,
    ui,
    onClose,
    updateSustainControlChanges,
    setPartNotes,
    clampPianoPitch,
    audioEngineRef,
    lastPreviewedPitchesRef,
    setSplitPreviewX,
    setSplitPreviewNoteIndex,
    setIsRedThemeActive,
    isRedThemeActive,
    partStartTime,
    bpm,
    setSelectedSustainRange,
  });

  // Helper function: 레인 위치 계산 (MidiEditorCalculations.ts에서 import)
  // 이전 pianoKeyHeightScale 값을 추적하여 변경 시에만 로그 남기기
  const prevPianoKeyHeightScaleRef = useRef<number | null>(null);
  
  const calculateLanePositions = useCallback(() => {
    prevPianoKeyHeightScaleRef.current = pianoKeyHeightScale;
    return calculateLanePositionsPure();
  }, [pianoKeyHeightScale]);

  // Helper function: 마우스 위치에서 시간과 피치 계산
  const getTimeAndPitchFromMouse = useCallback((e: React.MouseEvent | MouseEvent) => {
    if (!pianoRollRef.current) return null;
    const rect = pianoRollRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const currentPixelsPerSecond = pixelsPerSecond || initialPixelsPerSecond;
    const time = x / currentPixelsPerSecond;
    const lanes = calculateLanePositions();
    // 레인은 이미 역순으로 계산되어 있으므로 (위=높은음, 아래=낮은음) y 좌표를 그대로 사용
    const pitchIndex = lanes.findIndex(lane => {
      const laneTop = (lane.top / 100) * rect.height;
      const laneBottom = laneTop + (lane.height / 100) * rect.height;
      return y >= laneTop && y <= laneBottom;
    });
    if (pitchIndex === -1) return null;
    const pitch = lanes[pitchIndex].index;
    return { time, pitch };
  }, [pixelsPerSecond, initialPixelsPerSecond, calculateLanePositions]);

  // Helper function: 노트 퀀타이즈는 MidiEditorCalculations.ts에서 import

  // Step 7.9.5: 리사이즈 관련 코드는 useNoteResize 훅 내부로 이동됨

  // 드래그 중 Ctrl 키 감지 (전역 이벤트 리스너)
  useEffect(() => {
    if (!isDragging) return;

    // Ctrl 키 상태 추적 (useNoteDrag에서 isCtrlPressedDuringDrag를 제공하므로, 
    // 여기서는 UI 상태만 업데이트)
    const handleKeyDown = (e: KeyboardEvent) => {
      // 입력 필드, 버튼, select 등에 포커스가 있으면 키보드 이벤트 무시
      if (!(e.target instanceof HTMLElement)) return;
      const target = e.target;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.tagName === 'BUTTON' ||
        target.isContentEditable
      ) {
        return;
      }

      if (e.key === 'Control' || e.key === 'Meta' || e.ctrlKey || e.metaKey) {
        if (isDragging) {
          ui.setDuplicateModeActive(true);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // 입력 필드, 버튼, select 등에 포커스가 있으면 키보드 이벤트 무시
      if (!(e.target instanceof HTMLElement)) return;
      const target = e.target;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.tagName === 'BUTTON' ||
        target.isContentEditable
      ) {
        return;
      }

      if (e.key === 'Control' || e.key === 'Meta') {
        if (isDragging) {
          ui.setDuplicateModeActive(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isDragging, ui]);

  // Step 7.9.3.1: 마우스 다운 핸들러를 훅으로 추출
  const { handlePianoRollMouseDown } = useMidiEditorMouseDown({
    pianoRollRef: pianoRollRef as React.RefObject<HTMLDivElement>,
    measureRulerRef: measureRulerRef as React.RefObject<HTMLDivElement>,
    audioEngineRef,
    isDrawing,
    setIsDrawing,
    drawingNote,
    setDrawingNote,
    isSelecting,
    setIsSelecting,
    selectionRect,
    setSelectionRect,
    selectedNotes,
    setSelectedNotes,
    clickedNoteIndex,
    setClickedNoteIndex,
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
    splitPreviewX,
    setSplitPreviewX,
    splitPreviewNoteIndex,
    setSplitPreviewNoteIndex,
    setMarqueeSelectionStart,
    isCtrlPressedDuringMarqueeRef,
    marqueeSelectionSourceRef,
    setSelectedSustainRange,
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
  });

  // Step 7.9.3.2: 마우스 이동 핸들러를 훅으로 추출
  const { handlePianoRollMouseMove } = useMidiEditorMouseMove({
    pianoRollRef: pianoRollRef as React.RefObject<HTMLDivElement>,
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
  });

  // 기존 마우스 이동 핸들러 코드 제거됨 (1100-1282줄)
  
  // Step 7.9.3.3: 마우스 업 핸들러를 훅으로 추출
  const { handlePianoRollMouseUp } = useMidiEditorMouseUp({
    pianoRollRef: pianoRollRef as React.RefObject<HTMLDivElement>,
    audioEngineRef,
    lastPreviewedPitchesRef,
    dragStartPitchRef,
    handleDragMouseUp,
    cancelDrag,
    isDragging,
    dragStartNotes,
    dragOffset,
    setDragOffset,
    isCtrlPressedDuringDrag,
    isResizingNote,
    selectedNotes,
    setSelectedNotes,
    clickedNoteIndex,
    setClickedNoteIndex,
    hoveredNote,
    setHoveredNote,
    isDrawing,
    drawingNote,
    setIsDrawing,
    setDrawingNote,
    isSelecting,
    selectionRect,
    setIsSelecting,
    setSelectionRect,
    isCtrlPressedDuringMarqueeRef,
    marqueeSelectionSourceRef,
    velocityGraphAreaRef,
    velocityTabSelection,
    sustainRanges,
    setSelectedSustainRange,
    partId,
    partNotes,
    setPartNotes,
    bpm,
    timeSignature,
    pixelsPerSecond,
    initialPixelsPerSecond,
    calculateLanePositions,
    clampPianoPitch,
    quantizeNote,
    ui,
    partStartTime,
  });

  // Step 7.9.3.4: 더블클릭 핸들러를 훅으로 추출
  const { handlePianoRollDoubleClick } = useMidiEditorDoubleClick({
    audioEngineRef,
    getTimeAndPitchFromMouse,
    clampPianoPitch,
    partId,
    bpm,
    timeSignature,
    setPartNotes,
  });

  // 기존 더블클릭 핸들러 코드 제거됨 (1171-1208줄)

  // 푸터에서 시작된 마키 선택을 위한 전역 마우스 이동/업 핸들러
  useEffect(() => {
    if (!isSelecting || marqueeSelectionSourceRef.current !== 'footer' || !velocityGraphAreaRef.current) {
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (!isSelecting || !selectionRect || marqueeSelectionSourceRef.current !== 'footer' || !velocityGraphAreaRef.current) {
        return;
      }

      // velocityGraphAreaRef는 marginLeft: pianoKeysWidth가 이미 적용되어 있으므로
      // getBoundingClientRect()는 이미 오프셋된 위치를 반환합니다.
      const rect = velocityGraphAreaRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      setSelectionRect({
        ...selectionRect,
        endX: x,
        endY: y,
      });
    };

    const handleMouseUp = () => {
      // 푸터에서 시작된 마키 선택 완료 처리
      if (isSelecting && marqueeSelectionSourceRef.current === 'footer') {
        // handlePianoRollMouseUp을 호출하여 마키 선택 완료 로직 실행
        handlePianoRollMouseUp();
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isSelecting, selectionRect, velocityGraphAreaRef, handlePianoRollMouseUp]);

  // 렌더링 전 필수 연산 완료 확인
  // zoom값, zoom상태, 노트, 벨로시티가 모두 준비되어야 함
  // 컨테이너가 렌더링되고 실제 너비에 맞게 zoom이 계산되면 바로 표시
  // React가 자동으로 리렌더링하여 zoom 값이 적용됨
  // SSOT: minZoom도 계산 완료되어야 팝업 표시
  const isReadyToRender = !isCalculatingZoom && pixelsPerSecond !== null && minZoom !== null && part !== null && isContainerReady;

  // 프로젝트에서 타이밍 정보 가져오기
  const project = selectProject();
  const ppqn = getPpqn(project);
  const tempoMap = project.timing?.tempoMap ?? [];

  // Step 7.2: NoteLayer에 전달할 props 준비
  const noteLayerProps = useMemo(() => ({
    visibleNotes,
    partId,
    pixelsPerSecond: pixelsPerSecond ?? initialPixelsPerSecond,
    partDuration,
    bpm,
    timeSignature,
    ppqn,
    tempoMap,
    selectedNotes,
    isDragging,
    dragStartNotes,
    dragOffset,
    isCtrlPressedDuringDrag,
    resizingNoteIndex,
    resizePreview,
    hoveredResizeHandle,
    drawingNote,
    isDrawing,
    splitPreviewX,
    splitPreviewNoteIndex,
    cursorMode: ui.cursorMode,
    getVelocityColor,
    getVelocityBorderColor,
    isSplitMode,
    isRedThemeActive,
  }), [
    visibleNotes,
    partId,
    pixelsPerSecond,
    initialPixelsPerSecond,
    partDuration,
    bpm,
    timeSignature,
    ppqn,
    tempoMap,
    selectedNotes,
    isDragging,
    dragStartNotes,
    dragOffset,
    isCtrlPressedDuringDrag,
    resizingNoteIndex,
    resizePreview,
    hoveredResizeHandle,
    drawingNote,
    isDrawing,
    splitPreviewX,
    splitPreviewNoteIndex,
    ui.cursorMode,
    getVelocityColor,
    getVelocityBorderColor,
    isSplitMode,
    isRedThemeActive,
  ]);

  const getPlaybackTimeFromRuler = useCallback((clientX: number): number | null => {
    if (!measureRulerRef.current || !part) return null;
    const rect = measureRulerRef.current.getBoundingClientRect();
    const scrollLeft = measureRulerRef.current.scrollLeft;
    const x = clientX - rect.left + scrollLeft;
    const currentPixelsPerSecond = pixelsPerSecond ?? initialPixelsPerSecond;
    const project = getProject();
    const projectTimeSignature = getTimeSignature(project);
    const ppqn = getPpqn(project);
    const tempoMap = project.timing?.tempoMap ?? [];
    const { startTime: partStartTime } = ticksToSecondsPure(
      part.startTick,
      part.durationTicks,
      tempoMap,
      projectTimeSignature,
      ppqn
    );
    return Math.max(0, (x / currentPixelsPerSecond) + partStartTime);
  }, [part, pixelsPerSecond, initialPixelsPerSecond]);

  useEffect(() => {
    if (!isDraggingRulerPlayhead) return;

    const handleMouseMove = (e: MouseEvent) => {
      const time = getPlaybackTimeFromRuler(e.clientX);
      if (time === null) return;
      ui.setCurrentPlaybackTime(time);
    };

    const handleMouseUp = () => {
      setIsDraggingRulerPlayhead(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [getPlaybackTimeFromRuler, isDraggingRulerPlayhead, ui]);

  // 벨로시티 조절 로직 (드래그 중에는 미리보기만, 드롭 시에만 실제 업데이트)
  const currentPreviewVelocityRef = useRef<{ noteIndex: number; velocity: number } | null>(null);
  useEffect(() => {
    if (!isAdjustingVelocity || adjustingVelocityNoteIndex === -1 || !velocityAdjustStartPos || !velocityGraphAreaRef.current) {
      setPreviewVelocity(null);
      currentPreviewVelocityRef.current = null;
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (!velocityGraphAreaRef.current || !velocityAdjustStartPos) return;
      
      const rect = velocityGraphAreaRef.current.getBoundingClientRect();
      const currentY = e.clientY - rect.top;
      
      // 벨로시티 그래프 영역의 높이를 가져옴 (최대 127에 해당)
      const velocityBarHeight = rect.height;
      if (velocityBarHeight <= 0) return;
      
      // Y 좌표를 벨로시티 값으로 변환 (아래쪽이 높은 값, 위쪽이 낮은 값)
      // bottom: 0 = velocity 127, top: height = velocity 0
      const relativeY = Math.max(0, Math.min(velocityBarHeight, velocityBarHeight - currentY));
      const velocityRatio = relativeY / velocityBarHeight;
      const newVelocity = Math.round(velocityRatio * 127);
      
      // 벨로시티 미리보기 업데이트 (0-127 범위로 클램핑)
      // 실제 데이터는 업데이트하지 않고 UI만 업데이트
      const clampedVelocity = Math.max(0, Math.min(127, newVelocity));
      
      // 노트 인덱스가 유효한지 확인
      if (adjustingVelocityNoteIndex >= 0 && adjustingVelocityNoteIndex < partNotes.length) {
        const previewValue = { noteIndex: adjustingVelocityNoteIndex, velocity: clampedVelocity };
        currentPreviewVelocityRef.current = previewValue;
        setPreviewVelocity(previewValue);
      }
    };

    const handleMouseUp = () => {
      // 드롭 시에만 실제 벨로시티 업데이트 (성능 최적화)
      // ref를 사용하여 최신 값 보장
      const finalVelocity = currentPreviewVelocityRef.current;
      if (finalVelocity && finalVelocity.noteIndex === adjustingVelocityNoteIndex) {
        // 노트 인덱스가 유효한지 확인
        if (finalVelocity.noteIndex >= 0 && finalVelocity.noteIndex < partNotes.length) {
          updateNoteInMidiPart(partId, finalVelocity.noteIndex, { velocity: finalVelocity.velocity }, false);
        }
      }
      
      setIsAdjustingVelocity(false);
      setAdjustingVelocityNoteIndex(-1);
      setVelocityAdjustStartPos(null);
      setPreviewVelocity(null);
      currentPreviewVelocityRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isAdjustingVelocity, adjustingVelocityNoteIndex, velocityAdjustStartPos, partId, partNotes]);

  return (
    <div 
      className={styles.midiEditorOverlay} 
      onClick={(e) => {
        // 마키 선택 중이거나 마키 선택이 윈도우 안에서 시작되었다면 에디터를 닫지 않음
        const isMarqueeSelectionActive = isSelecting || marqueeSelectionSourceRef.current !== null;
        if (e.target === e.currentTarget && isReadyToRender && !isMarqueeSelectionActive) {
          onClose();
        }
      }}
      style={{ 
        zIndex: 10000,
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: isReadyToRender ? `rgba(0, 0, 0, ${MIDI_EDITOR_CONSTANTS.OVERLAY_BACKGROUND_OPACITY})` : 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: isReadyToRender ? 1 : 0,
        pointerEvents: isReadyToRender ? 'auto' : 'none',
        transition: isReadyToRender ? 'opacity 0.1s ease-in' : 'none'
      }}
    >
      <div 
        className={styles.midiEditor} 
        onClick={(e) => e.stopPropagation()}
        style={{
          opacity: isReadyToRender ? 1 : 0,
          visibility: isReadyToRender ? 'visible' : 'hidden',
          transition: isReadyToRender ? 'opacity 0.1s ease-in' : 'none'
        }}
      >
        <EditorHeader
          title="MIDI Editor"
          onClose={onClose}
          pixelsPerSecond={pixelsPerSecond ?? initialPixelsPerSecond}
          onPixelsPerSecondChange={(value) => {
            // 줌 변경 시 momentum blocking 초기화하여 Y축 스크롤이 정상 작동하도록 함
            const container = pianoRollContainerRef.current;
            if (container) {
              // 진행 중인 momentum blocking 취소
              if (momentumBlockTimeoutRef.current !== null) {
                clearTimeout(momentumBlockTimeoutRef.current);
                momentumBlockTimeoutRef.current = null;
              }
              if (momentumBlockRafRef.current !== null) {
                cancelAnimationFrame(momentumBlockRafRef.current);
                momentumBlockRafRef.current = null;
              }
              // overflow 복원
              container.style.overflow = 'auto';
              // 추적 값 초기화
              lastProgrammaticScrollLeftRef.current = null;
            }
            setPixelsPerSecond(value);
            setHasUserAdjustedZoom(true);
          }}
          setHasUserAdjustedZoom={setHasUserAdjustedZoom}
          pianoKeyHeightScale={pianoKeyHeightScale}
          onPianoKeyHeightScaleChange={setPianoKeyHeightScale}
          minZoom={minZoom ?? MIDI_EDITOR_CONSTANTS.MIN_ZOOM}
          maxZoom={MAX_ZOOM}
        />
        <div 
          ref={editorContentRef}
          className={styles.editorContent}
        >
          <div 
            className={styles.pianoKeys}
            style={{
              // Fixed column height; actual vertical scaling is applied to inner content,
              // so scroll height stays consistent and doesn't create extra blank space.
              height: '100%',
            }}
          >
            {/* Left-side spacer to align keys with the ruler height on the right */}
            <div style={{ height: `${MIDI_EDITOR_CONSTANTS.RULER_HEIGHT}px`, flex: '0 0 auto' }} />
            {/* 11옥타브 렌더링 (G9 → C-1, 위에서 아래로) */}
            <div ref={pianoKeysRef} className={styles.pianoKeysScroll}>
              <div
                style={{
                  height: `${pianoKeyHeightScale * 100}%`,
                  position: 'relative',
                  width: '100%',
                }}
              >
                {Array.from({ length: 11 }, (_, i) => {
                  const octave = 9 - i; // 9, 8, 7, ..., -1
                  // 옥타브 9는 8/12 = 2/3 높이, 나머지는 동일한 높이
                  const fullOctaveHeight = 100 / (10 + (8/12)); // 10개 완전 옥타브 + 1개 부분 옥타브(8/12)
                  const octave9Height = fullOctaveHeight * (8/12);
                  const octaveHeight = fullOctaveHeight;
                  
                  let octaveTop = 0;
                  let octaveHeightPercent = octaveHeight;
                  
                  if (octave === 9) {
                    octaveTop = 0;
                    octaveHeightPercent = octave9Height;
                  } else {
                    // 옥타브 8부터는 octave9Height 아래에서 시작
                    octaveTop = octave9Height + (8 - octave) * octaveHeight;
                    octaveHeightPercent = octaveHeight;
                  }
                  
                  return (
                    <div
                      key={`octave-${octave}`}
                      style={{
                        position: 'absolute',
                        top: `${octaveTop}%`,
                        height: `${octaveHeightPercent}%`,
                        width: '100%',
                      }}
                    >
                      <PianoOctave
                        octave={octave}
                        minMidiNote={octave === 9 ? 120 : 0}
                        maxMidiNote={127}
                        onKeyClick={handlePianoKeyClick}
                        onKeyRelease={handlePianoKeyRelease}
                        hoveredMidiNote={hoveredNote}
                        pressedMidiNotes={(() => {
                          const pressedNotes = new Set<number>();

                          // 드래그 중인 노트들의 경우 오프셋을 적용한 피치 추가
                          if (isDragging && dragStartNotes.length > 0) {
                            dragStartNotes.forEach(({ note: originalNote }) => {
                              const newPitch = Math.max(0, Math.min(127, originalNote.note + dragOffset.pitch));
                              pressedNotes.add(newPitch);
                            });
                          } else {
                            // 드래그 중이 아닐 때는 선택된 노트들의 원래 MIDI 노트 번호 추가
                            selectedNotes.forEach(index => {
                              if (index < partNotes.length) {
                                pressedNotes.add(partNotes[index].note);
                              }
                            });
                          }

                          // 노트를 그릴 때 해당 노트 추가
                          if (isDrawing && drawingNote) {
                            pressedNotes.add(drawingNote.note);
                          }

                          return pressedNotes.size > 0 ? pressedNotes : null;
                        })()}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          {/* 에디터 영역 (세로 스크롤 가능) */}
          <div className={styles.pianoRollColumn}>
            {/* 룰러 (고정, 가로 스크롤 가능) */}
            {part && (() => {
              // 파트의 startTime 계산 (tick 기반, SMF 표준 정합)
              const project = getProject();
              const timeSignature = getTimeSignature(project);
              const ppqn = getPpqn(project);
              const tempoMap = project.timing?.tempoMap ?? [];
              const { startTime: partStartTime } = ticksToSecondsPure(
                part.startTick,
                part.durationTicks,
                tempoMap,
                timeSignature,
                ppqn
              );
              
              return (
                <div 
                  key="local-ruler"
                  ref={measureRulerRef}
                  className={styles.rulerContainer}
                  onWheel={(e) => {
                    // 룰러 영역에서는 Shift+휠로 인한 횡이동 차단
                    if (e.shiftKey) {
                      e.preventDefault();
                      e.stopPropagation();
                    }
                  }}                  onMouseDown={(e) => {
                    if (e.button !== 0) return;
                    const time = getPlaybackTimeFromRuler(e.clientX);
                    if (time === null) return;
                    ui.setCurrentPlaybackTime(time);
                    setIsDraggingRulerPlayhead(true);
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                >
                  <div 
                    className={styles.rulerContent}
                    style={{ width: `${contentWidth + 1}px` }}
                  >
                    <MeasureRuler
                      bpm={bpm}
                      timeSignature={timeSignature}
                      pixelsPerSecond={pixelsPerSecond ?? initialPixelsPerSecond}
                      startTime={partStartTime}
                      disableInteraction={true}
                    />
                    {/* 재생 위치 표시 (playhead) */}
                    <div
                      className={`${styles.playhead} ${ui.isRecording ? styles.playheadRecording : ''}`}
                      style={{
                        left: `${(currentPlaybackTime - partStartTime) * (pixelsPerSecond ?? initialPixelsPerSecond)}px`,
                      }}
                    />
                  </div>
                </div>
              );
            })()}
            {/* Step 7.4: 피아노 롤 컨테이너를 PianoRoll 컴포넌트로 교체 */}
            <PianoRoll
              pianoKeyHeightScale={pianoKeyHeightScale}
              contentWidth={contentWidth}
              isDragging={isDragging}
              calculateLanePositions={calculateLanePositions}
              setHoveredNote={setHoveredNote}
              onMouseDown={handlePianoRollMouseDown}
              onMouseMove={handlePianoRollMouseMove}
              onMouseUp={handlePianoRollMouseUp}
              onDoubleClick={handlePianoRollDoubleClick}
              cursorMode={ui.cursorMode}
              isSplitMode={isSplitMode}
              splitPreviewNoteIndex={splitPreviewNoteIndex}
              noteLayerProps={noteLayerProps}
          pianoRollRef={pianoRollRef}
          pianoRollContainerRef={pianoRollContainerRef}
          measureRulerRef={measureRulerRef}
          velocityGraphAreaRef={velocityGraphAreaRef}
          lastProgrammaticScrollLeftRef={lastProgrammaticScrollLeftRef}
          momentumBlockTimeoutRef={momentumBlockTimeoutRef}
          momentumBlockRafRef={momentumBlockRafRef}
              part={part ?? null}
              partDuration={partDuration}
              bpm={bpm}
              timeSignature={timeSignature}
              pixelsPerSecond={pixelsPerSecond}
              initialPixelsPerSecond={initialPixelsPerSecond}
              currentPlaybackTime={currentPlaybackTime}
              isSelecting={isSelecting}
              selectionRect={selectionRect}
              marqueeSelectionSourceRef={marqueeSelectionSourceRef}
              onPixelsPerSecondChange={(value) => {
                setPixelsPerSecond(value);
                setHasUserAdjustedZoom(true);
              }}
              minZoom={minZoom ?? MIDI_EDITOR_CONSTANTS.MIN_ZOOM}
              maxZoom={MAX_ZOOM}
            />
          </div>
        </div>
        <EditorFooter
          partId={partId}
          part={part ?? null}
          visibleNotes={visibleNotes}
          sustainRanges={sustainRanges}
          displayedSustainRanges={displayedSustainRanges}
          velocityTabSelection={velocityTabSelection}
          setVelocityTabSelection={setVelocityTabSelection}
          contentWidth={contentWidth}
          pixelsPerSecond={pixelsPerSecond}
          initialPixelsPerSecond={initialPixelsPerSecond}
          partDuration={partDuration}
          bpm={bpm}
          timeSignature={timeSignature}
          pianoRollContainerRef={pianoRollContainerRef}
          velocityDisplayRef={velocityDisplayRef}
          velocityGraphAreaRef={velocityGraphAreaRef}
          setIsAdjustingVelocity={setIsAdjustingVelocity}
          setAdjustingVelocityNoteIndex={setAdjustingVelocityNoteIndex}
          setVelocityAdjustStartPos={setVelocityAdjustStartPos}
          previewVelocity={previewVelocity}
          selectedNotes={selectedNotes}
          isRedThemeActive={isRedThemeActive}
          selectedSustainRange={selectedSustainRange}
          setSelectedSustainRange={setSelectedSustainRange}
          isDrawingSustain={isDrawingSustain}
          setIsDrawingSustain={setIsDrawingSustain}
          drawingSustain={drawingSustain}
          setDrawingSustain={setDrawingSustain}
          isDraggingSustainRange={isDraggingSustainRange}
          setIsDraggingSustainRange={setIsDraggingSustainRange}
          sustainDragStart={sustainDragStart}
          setSustainDragStart={setSustainDragStart}
          sustainDragPreview={sustainDragPreview}
          setSustainDragPreview={setSustainDragPreview}
          isResizingSustainRange={isResizingSustainRange}
          setIsResizingSustainRange={setIsResizingSustainRange}
          sustainResizeStart={sustainResizeStart}
          setSustainResizeStart={setSustainResizeStart}
          sustainResizePreview={sustainResizePreview}
          setSustainResizePreview={setSustainResizePreview}
          ui={ui}
          quantizeNote={quantizeNote}
          isSelecting={isSelecting}
          selectionRect={selectionRect}
          setIsSelecting={setIsSelecting}
          setSelectionRect={setSelectionRect}
          setSelectedNotes={setSelectedNotes}
          isCtrlPressedDuringMarqueeRef={isCtrlPressedDuringMarqueeRef}
          partNotes={partNotes}
          marqueeSelectionSourceRef={marqueeSelectionSourceRef}
        />
      </div>
    </div>
  );
};

export default MidiEditor;



