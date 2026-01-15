import { useCallback, useEffect } from 'react';
import { getProject, getMidiPartNotes, addNoteToMidiPart, addMultipleNotesToMidiPart, updateNoteInMidiPart, getMidiPartHistory, mergeNotes } from '../store/projectStore';
import { useUIState } from '../store/uiStore';
import { ticksToSecondsPure, secondsToTicksPure, getPpqn, getTimeSignature, getBpm } from '../utils/midiTickUtils';
import type { MidiNote } from '../types/project';
import type { AudioEngine } from '../core/audio/AudioEngine';
import type { SustainRange } from './useSustainPedal';

type UIStateType = ReturnType<typeof useUIState>;

/**
 * useMidiEditorMouseUp 훅 Props
 * Phase 7.9.3.3: 마우스 업 핸들러를 훅으로 추출
 */
export interface UseMidiEditorMouseUpProps {
  // Refs
  pianoRollRef: React.RefObject<HTMLDivElement>;
  audioEngineRef: React.RefObject<AudioEngine | null>;
  lastPreviewedPitchesRef: React.MutableRefObject<Map<number, number>>;
  dragStartPitchRef: React.MutableRefObject<number | null>;
  
  // Drag
  handleDragMouseUp: () => void;
  cancelDrag: () => void;
  isDragging: boolean;
  dragStartNotes: Array<{ index: number; note: MidiNote }>;
  dragOffset: { time: number; pitch: number } | null;
  setDragOffset: (value: { time: number; pitch: number }) => void;
  isCtrlPressedDuringDrag: boolean;
  
  // States - Resize
  isResizingNote: boolean;
  
  // States - Selection
  selectedNotes: Set<number>;
  setSelectedNotes: (notes: Set<number>) => void;
  clickedNoteIndex: number;
  setClickedNoteIndex: (value: number) => void;
  hoveredNote: number | null;
  setHoveredNote: (value: number | null) => void;
  
  // States - Drawing
  isDrawing: boolean;
  drawingNote: { note: number; startTime: number; endTime?: number } | null;
  setIsDrawing: (value: boolean) => void;
  setDrawingNote: (value: { note: number; startTime: number; endTime?: number } | null) => void;
  
  // States - Selection (Marquee)
  isSelecting: boolean;
  selectionRect: { startX: number; startY: number; endX: number; endY: number } | null;
  setIsSelecting: (value: boolean) => void;
  setSelectionRect: (value: { startX: number; startY: number; endX: number; endY: number } | null) => void;
  isCtrlPressedDuringMarqueeRef: React.MutableRefObject<boolean>;
  marqueeSelectionSourceRef?: React.MutableRefObject<'pianoRoll' | 'footer' | null>;
  velocityGraphAreaRef?: React.RefObject<HTMLDivElement | null>;
  velocityTabSelection?: 'velocity' | 'sustain';
  sustainRanges?: SustainRange[];
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
  clampPianoPitch: (pitch: number) => number;
  quantizeNote: (time: number, gridSize: number) => number;
  
  // UI
  ui: UIStateType;
  
  // Quantization
  partStartTime: number;
}

/**
 * useMidiEditorMouseUp 훅 반환 타입
 */
export interface UseMidiEditorMouseUpReturn {
  handlePianoRollMouseUp: () => void;
}

/**
 * MIDI 에디터 마우스 업 핸들러를 관리하는 훅
 * Phase 7.9.3.3: 마우스 업 핸들러를 훅으로 추출
 */
export const useMidiEditorMouseUp = ({
  pianoRollRef,
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
  clickedNoteIndex: _clickedNoteIndex,
  setClickedNoteIndex,
  hoveredNote: _hoveredNote,
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
}: UseMidiEditorMouseUpProps): UseMidiEditorMouseUpReturn => {
  
  const handlePianoRollMouseUp = useCallback(() => {
    // 리사이즈 중일 때는 전역 이벤트 리스너가 처리하므로 여기서는 early return
    if (isResizingNote) {
      return;
    }

    // merge 모드일 때 선택된 노트들을 merge (드래그가 발생하지 않았을 때만)
    // Ctrl + 클릭으로 다중 선택한 경우 merge를 실행하지 않음 (드래그가 시작되지 않았으므로 isDragging이 false)
    if (ui.cursorMode === 'mergeByKey4' && selectedNotes.size >= 2 && !isDragging) {
      const noteIndices = Array.from(selectedNotes).sort((a, b) => a - b);
      const result = mergeNotes(partId, noteIndices);

      if (result) {
        setPartNotes(getMidiPartNotes(partId));
        setSelectedNotes(new Set([result.mergedNoteIndex]));
      }
      return;
    }
    
    // useNoteDrag 훅의 handleMouseUp 사용 (잠재적 드래그 정리 포함)
    handleDragMouseUp();

    // 노트 드래그 완료 처리 (기존 로직 유지)
    if (isDragging && dragStartNotes.length > 0 && dragOffset) {
      // 먼저 현재 노트 상태를 가져와서 이전 상태 저장
      const freshNotes = getMidiPartNotes(partId);
      const project = getProject();
      const part = project.midiParts.find(p => p.id === partId);
      if (!part) return;
      
      // Ctrl 키가 눌려있으면 복제 모드
      if (isCtrlPressedDuringDrag) {
        // 복제 모드: 원본 노트는 유지하고 새로운 노트 추가
        const newNotes: MidiNote[] = [];
        
        dragStartNotes.forEach(({ note: originalNote }) => {
          // Tick 기반으로 노트 복제 (SMF 표준 정합)
          const originalStartTick = originalNote.startTick ?? 0;
          const originalDurationTicks = originalNote.durationTicks ?? 0;
          
          // 시간 오프셋을 Tick으로 변환
          const project = getProject();
          const timeSignature = getTimeSignature(project);
          const ppqn = getPpqn(project);
          const tempoMap = project.timing?.tempoMap ?? [];
          const { startTick: timeOffsetTicks } = secondsToTicksPure(
            dragOffset.time,
            0,
            tempoMap,
            timeSignature,
            ppqn
          );
          
          // 새로운 Tick 위치 계산
          let newStartTick = originalStartTick + timeOffsetTicks;
          newStartTick = Math.max(0, newStartTick);
          
          // 퀀타이즈가 활성화되어 있으면 마디 기준으로 퀀타이즈
          if (ui.isQuantizeEnabled) {
            const project = getProject();
            const projectTimeSignature = getTimeSignature(project);
            const ppqn = getPpqn(project);
            const tempoMap = project.timing?.tempoMap ?? [];
            const beatUnit = projectTimeSignature[1];
            const noteValueRatio = 4 / beatUnit;
            const secondsPerBeat = (60 / bpm) * noteValueRatio;
            const gridSize = secondsPerBeat;
            
            // tick을 seconds로 변환 (상대 시간)
            const { startTime: startTimeRelative } = ticksToSecondsPure(newStartTick, 0, tempoMap, projectTimeSignature, ppqn);
            
            // 상대 시간을 절대 시간으로 변환 (마디 기준)
            const startTimeAbsolute = partStartTime + startTimeRelative;
            
            // 퀀타이즈 적용 (절대 시간 기준)
            const quantizedStartTimeAbsolute = quantizeNote(startTimeAbsolute, gridSize);
            
            // 절대 시간을 상대 시간으로 변환
            const quantizedStartTimeRelative = quantizedStartTimeAbsolute - partStartTime;
            
            // 상대 시간을 tick으로 변환
            const { startTick: quantizedStartTick } = secondsToTicksPure(quantizedStartTimeRelative, 0, tempoMap, projectTimeSignature, ppqn);
            
            newStartTick = Math.max(0, quantizedStartTick);
          }
          
          // 파트의 Tick 길이
          const partDurationTicks = part.durationTicks;
          
          // 노트가 클립 범위를 벗어나지 않도록 제한
          if (newStartTick + originalDurationTicks <= partDurationTicks) {
            const newPitch = clampPianoPitch(originalNote.note + dragOffset.pitch);
            
            const clonedNote: MidiNote = {
              note: newPitch,
              velocity: originalNote.velocity ?? 100,
              channel: originalNote.channel,
              releaseVelocity: originalNote.releaseVelocity,
              startTick: newStartTick,
              durationTicks: originalDurationTicks,
            };
            
            newNotes.push(clonedNote);
          }
        });
        
        // 새로운 노트 추가 (여러 노트를 한 번에 추가하여 하나의 히스토리 액션으로 기록)
        const notesToAdd = newNotes.map(note => ({ ...note, note: clampPianoPitch(note.note) }));
        if (notesToAdd.length > 0) {
          addMultipleNotesToMidiPart(partId, notesToAdd);
        }
        
        if (newNotes.length > 0) {
          setPartNotes(getMidiPartNotes(partId));
          
          // 노트 복제 완료 시 사운드 피드백
          if (audioEngineRef.current && newNotes.length > 0) {
            const project = getProject();
            const part = project.midiParts.find(p => p.id === partId);
            const track = part ? project.tracks.find(t => t.id === part.trackId) : null;
            const instrument = track?.instrument || 'piano';
            const firstNewNote = newNotes[0];
            void audioEngineRef.current.previewNote(firstNewNote.note, firstNewNote.velocity ?? 100, instrument);
          }
          
          // 툴바에 flash 효과
          ui.setDuplicateFlashActive(true);
          setTimeout(() => {
            ui.setDuplicateFlashActive(false);
          }, 200);
        }
        
        // 드래그 완료 시 모든 경로의 소리 중지
        if (audioEngineRef.current) {
          lastPreviewedPitchesRef.current.forEach((pitch) => {
            audioEngineRef.current?.stopPreview(pitch);
          });
          lastPreviewedPitchesRef.current.clear();
        }
        
        // 드래그 취소 (useNoteDrag 훅 사용)
        cancelDrag();
        setDragOffset({ time: 0, pitch: 0 });
        setClickedNoteIndex(-1);
        ui.setDuplicateModeActive(false);
        dragStartPitchRef.current = null;
        setHoveredNote(null);
        return;
      }
      
      // 일반 드래그 모드: 노트 위치 업데이트
      const updates: Array<{ index: number; oldNote: MidiNote; newNote: Partial<MidiNote> }> = [];
      
      dragStartNotes.forEach(({ note: originalNote }) => {
        // Tick 기반으로 노트 찾기 (SMF 표준 정합)
        const originalStartTick = originalNote.startTick ?? 0;
        const originalDurationTicks = originalNote.durationTicks ?? 0;
        const freshIndex = freshNotes.findIndex(n =>
          n.startTick === originalStartTick &&
          n.note === originalNote.note &&
          n.durationTicks === originalDurationTicks
        );
        
        if (freshIndex >= 0) {
          // Tick 기반 드래그 완료 처리 (SMF 표준 정합, 미디파트 드래그와 동일한 델타 방식)
          // 시간 오프셋을 Tick으로 변환 (음수도 허용)
          const project = getProject();
          const timeSignature = getTimeSignature(project);
          const ppqn = getPpqn(project);
          const tempoMap = project.timing?.tempoMap ?? [];
          const { startTick: timeOffsetTicks } = secondsToTicksPure(
            dragOffset.time,
            0,
            tempoMap,
            timeSignature,
            ppqn
          );
          
          // 새로운 Tick 위치 계산 (음수도 허용하되, 최종 위치는 0 이상으로 클램핑)
          // 미디파트 드래그와 동일한 방식: 델타를 먼저 계산하고 최종 위치만 클램핑
          let newStartTick = originalStartTick + timeOffsetTicks;
          newStartTick = Math.max(0, newStartTick);  // 최종 위치만 0 이상으로 클램핑
          
          // 퀀타이즈가 활성화되어 있으면 마디 기준으로 퀀타이즈
          if (ui.isQuantizeEnabled) {
            const project = getProject();
            const projectTimeSignature = getTimeSignature(project);
            const ppqn = getPpqn(project);
            const tempoMap = project.timing?.tempoMap ?? [];
            const beatUnit = projectTimeSignature[1];
            const noteValueRatio = 4 / beatUnit;
            const secondsPerBeat = (60 / bpm) * noteValueRatio;
            const gridSize = secondsPerBeat;
            
            // tick을 seconds로 변환 (상대 시간)
            const { startTime: startTimeRelative } = ticksToSecondsPure(newStartTick, 0, tempoMap, projectTimeSignature, ppqn);
            
            // 상대 시간을 절대 시간으로 변환 (마디 기준)
            const startTimeAbsolute = partStartTime + startTimeRelative;
            
            // 퀀타이즈 적용 (절대 시간 기준)
            const quantizedStartTimeAbsolute = quantizeNote(startTimeAbsolute, gridSize);
            
            // 절대 시간을 상대 시간으로 변환
            const quantizedStartTimeRelative = quantizedStartTimeAbsolute - partStartTime;
            
            // 상대 시간을 tick으로 변환
            const { startTick: quantizedStartTick } = secondsToTicksPure(quantizedStartTimeRelative, 0, tempoMap, projectTimeSignature, ppqn);
            
            newStartTick = Math.max(0, quantizedStartTick);
          }
          
          // 파트의 Tick 길이 (직접 사용, SMF 표준 정합)
          const partDurationTicks = part.durationTicks;
          
          // 노트가 클립 범위를 벗어나지 않도록 제한 (이미 0 이상으로 클램핑되었으므로 >= 0 체크 불필요)
          if (newStartTick + originalDurationTicks <= partDurationTicks) {
            const newPitch = Math.max(0, Math.min(127, originalNote.note + dragOffset.pitch));
            const oldNote = freshNotes[freshIndex];
            updates.push({
              index: freshIndex,
              oldNote: { ...oldNote },
              newNote: {
                startTick: newStartTick,
                note: newPitch,
              }
            });
          }
        }
      });
      
      // 모든 노트를 skipHistory=true로 업데이트 (히스토리 기록 없이)
      updates.forEach(({ index, newNote }) => {
        updateNoteInMidiPart(partId, index, newNote, true);
      });
      
      // 그 다음 모든 변경사항을 히스토리에 기록
      if (part && updates.length > 0) {
        const history = getMidiPartHistory(partId);
        const MAX_HISTORY = 100;
        
        // 여러 노트 업데이트를 하나의 액션으로 묶기
        const historyUpdates = updates.map(({ index, oldNote, newNote }) => {
          return {
            noteIndex: index,
            oldNote: { ...oldNote },
            newNote: { ...newNote },
          };
        });
        
        if (historyUpdates.length > 0) {
          // 여러 노트를 하나의 액션으로 기록
          if (historyUpdates.length === 1) {
            // 단일 노트인 경우 기존 방식 사용
            const update = historyUpdates[0];
            history.undoStack.push({ 
              type: 'updateNote', 
              noteIndex: update.noteIndex, 
              oldNote: update.oldNote, 
              newNote: update.newNote, 
              partId
            });
          } else {
            // 여러 노트인 경우 하나의 액션으로 묶기
            history.undoStack.push({
              type: 'updateMultipleNotes',
              updates: historyUpdates,
              partId
            });
          }
          
          history.redoStack.length = 0;
          if (history.undoStack.length > MAX_HISTORY) {
            history.undoStack.shift();
          }
        }
      }
      
      setPartNotes(getMidiPartNotes(partId));
      
      // 드래그 완료 시 모든 경로의 소리 중지
      if (audioEngineRef.current) {
        lastPreviewedPitchesRef.current.forEach((pitch) => {
          audioEngineRef.current?.stopPreview(pitch);
        });
        lastPreviewedPitchesRef.current.clear();
      }
      
      // 노트 이동 완료 시 사운드 피드백 (목적지 피치만 재생)
      if (updates.length > 0 && audioEngineRef.current) {
        const project = getProject();
        const part = project.midiParts.find(p => p.id === partId);
        const track = part ? project.tracks.find(t => t.id === part.trackId) : null;
        const instrument = track?.instrument || 'piano';
        const engine = audioEngineRef.current;
        updates.forEach((update) => {
          const finalPitch = update.newNote.note ?? dragStartNotes.find(n => n.index === update.index)?.note.note;
          if (finalPitch !== undefined) {
            const originalNote = dragStartNotes.find(n => n.index === update.index)?.note;
            if (originalNote) {
              void engine.previewNote(finalPitch, originalNote.velocity ?? 100, instrument);
            }
          }
        });
      }
      
      // 드래그 취소 (useNoteDrag 훅 사용)
      cancelDrag();
      setDragOffset({ time: 0, pitch: 0 });
      setClickedNoteIndex(-1);
      ui.setDuplicateModeActive(false);
      dragStartPitchRef.current = null;
      setHoveredNote(null);
    }
    
    // 노트 그리기 완료
    if (isDrawing && drawingNote) {
      const project = getProject();
      const part = project.midiParts.find(p => p.id === partId);
      if (!part) return;
      
      // Tick 기반 노트 생성 (SMF 표준 정합)
      // drawingNote.startTime은 파트 내부의 상대 시간(초)이므로, Tick으로 변환
      const timeSignature = getTimeSignature(project);
      const ppqn = getPpqn(project);
      const tempoMap = project.timing?.tempoMap ?? [];
      
      // 그리드 크기 계산
      const bpm = getBpm(project);
      const beatUnit = timeSignature[1];
      const noteValueRatio = 4 / beatUnit;
      const secondsPerBeat = (60 / bpm) * noteValueRatio;
      const gridSize = secondsPerBeat;
      
      let endTime = drawingNote.endTime !== undefined 
        ? drawingNote.endTime 
        : drawingNote.startTime + gridSize;
      
      // 퀀타이즈가 활성화되어 있으면 endTime도 마디 기준으로 퀀타이즈
      if (ui.isQuantizeEnabled) {
        // 상대 시간을 절대 시간으로 변환 (마디 기준)
        const endTimeAbsolute = partStartTime + endTime;
        
        // 퀀타이즈 적용 (절대 시간 기준)
        const quantizedEndTimeAbsolute = quantizeNote(endTimeAbsolute, gridSize);
        
        // 절대 시간을 상대 시간으로 변환
        endTime = quantizedEndTimeAbsolute - partStartTime;
        
        // endTime이 startTime보다 작으면 startTime + gridSize로 설정
        if (endTime < drawingNote.startTime) {
          endTime = drawingNote.startTime + gridSize;
        }
      }
      
      const duration = Math.max(gridSize, endTime - drawingNote.startTime);
      const { startTick: relativeStartTick, durationTicks: noteDurationTicks } = secondsToTicksPure(
        drawingNote.startTime,
        duration,
        tempoMap,
        timeSignature,
        ppqn
      );
      
      const newNote: MidiNote = {
        note: clampPianoPitch(drawingNote.note),
        velocity: 100,
        startTick: relativeStartTick,
        durationTicks: noteDurationTicks,
      };
      
      addNoteToMidiPart(partId, newNote);
      const notesAfterAdd = getMidiPartNotes(partId);
      setPartNotes(notesAfterAdd);
      
      // 노트 생성 시 사운드 피드백
      if (audioEngineRef.current) {
        const track = project.tracks.find(t => t.id === part.trackId);
        const instrument = track?.instrument || 'piano';
        void audioEngineRef.current.previewNote(newNote.note, newNote.velocity ?? 100, instrument);
      }
      
      setIsDrawing(false);
      setDrawingNote(null);
    }
    
    // Marquee 선택 완료
    if (isSelecting && selectionRect) {
      const isFromFooter = marqueeSelectionSourceRef?.current === 'footer';
      const containerRef = isFromFooter ? velocityGraphAreaRef : pianoRollRef;
      const containerRect = containerRef?.current?.getBoundingClientRect();
      
      if (!containerRect) {
        setIsSelecting(false);
        setSelectionRect(null);
        if (marqueeSelectionSourceRef) {
          marqueeSelectionSourceRef.current = null;
        }
        return;
      }
      
      const minX = Math.min(selectionRect.startX, selectionRect.endX);
      const maxX = Math.max(selectionRect.startX, selectionRect.endX);
      const minY = Math.min(selectionRect.startY, selectionRect.endY);
      const maxY = Math.max(selectionRect.startY, selectionRect.endY);
      
      // 선택 영역 내의 노트 찾기
      const newSelectedNotes = new Set<number>();
      
      if (isFromFooter) {
        // 푸터에서 마키 선택
        if (velocityTabSelection === 'sustain' && sustainRanges && setSelectedSustainRange) {
          // 서스테인 탭: 선택 영역과 겹치는 sustain range 선택
          const currentPixelsPerSecond = pixelsPerSecond || initialPixelsPerSecond;
          const project = getProject();
          const timeSignature = getTimeSignature(project);
          const ppqn = getPpqn(project);
          const tempoMap = project.timing?.tempoMap ?? [];
          
          // 선택 영역과 겹치는 sustain range 찾기
          const selectedSustainIndices: number[] = [];
          sustainRanges.forEach((range, index) => {
            const { startTime: rangeStartTime } = ticksToSecondsPure(
              range.startTick,
              0,
              tempoMap,
              timeSignature,
              ppqn
            );
            const { startTime: rangeEndTime } = ticksToSecondsPure(
              range.endTick,
              0,
              tempoMap,
              timeSignature,
              ppqn
            );
            const rangeX = rangeStartTime * currentPixelsPerSecond;
            const rangeWidth = (rangeEndTime - rangeStartTime) * currentPixelsPerSecond;
            
            // 선택 영역과 겹치는지 확인 (Y 좌표 무시)
            if (rangeX + rangeWidth >= minX && rangeX <= maxX) {
              selectedSustainIndices.push(index);
            }
          });
          
          // Ctrl 키가 눌려있지 않으면 첫 번째로 겹치는 range만 선택
          if (!isCtrlPressedDuringMarqueeRef.current && selectedSustainIndices.length > 0) {
            setSelectedSustainRange(new Set(selectedSustainIndices));
            // 노트 선택 해제
            setSelectedNotes(new Set());
          } else if (selectedSustainIndices.length > 0) {
            // Ctrl 키가 눌려있으면 여러 개 선택 (기존 선택에 추가)
            setSelectedSustainRange(prev => {
              const next = new Set(prev || new Set());
              selectedSustainIndices.forEach(idx => next.add(idx));
              return next;
            });
            // 노트 선택 해제 (Ctrl 키가 눌려있어도 서스테인 선택 시 노트 선택 해제)
            setSelectedNotes(new Set());
          } else {
            setSelectedSustainRange(new Set());
            // 노트 선택 해제
            setSelectedNotes(new Set());
          }
        } else {
          // 벨로시티 탭: 벨로시티 바 기준으로 노트 선택
          const currentPixelsPerSecond = pixelsPerSecond || initialPixelsPerSecond;
          
          partNotes.forEach((note, index) => {
            // Tick 기반으로 노트 위치 계산 (SMF 표준 정합)
            const project = getProject();
            const noteStartTick = note.startTick ?? 0;
            const noteDurationTicks = note.durationTicks ?? 0;
            const timeSignature = getTimeSignature(project);
            const ppqn = getPpqn(project);
            const tempoMap = project.timing?.tempoMap ?? [];
            const { startTime: noteStartTime, duration: noteDuration } = ticksToSecondsPure(
              noteStartTick,
              noteDurationTicks,
              tempoMap,
              timeSignature,
              ppqn
            );
            const noteX = noteStartTime * currentPixelsPerSecond;
            const noteWidth = noteDuration * currentPixelsPerSecond;
            
            // 푸터에서는 Y 좌표를 무시하고 시간(X) 기준으로만 선택
            // 벨로시티 바의 전체 높이를 사용
            if (noteX + noteWidth >= minX && noteX <= maxX) {
              newSelectedNotes.add(index);
            }
          });
        }
      } else {
        // 피아노 롤에서 마키 선택: 기존 로직
        const lanes = calculateLanePositions();
        
        partNotes.forEach((note, index) => {
          // Tick 기반으로 노트 위치 계산 (SMF 표준 정합)
          const project = getProject();
          const noteStartTick = note.startTick ?? 0;
          const noteDurationTicks = note.durationTicks ?? 0;
          const timeSignature = getTimeSignature(project);
          const ppqn = getPpqn(project);
          const tempoMap = project.timing?.tempoMap ?? [];
          const { startTime: noteStartTime, duration: noteDuration } = ticksToSecondsPure(
            noteStartTick,
            noteDurationTicks,
            tempoMap,
            timeSignature,
            ppqn
          );
          const currentPixelsPerSecond = pixelsPerSecond || initialPixelsPerSecond;
          const noteX = noteStartTime * currentPixelsPerSecond;
          const noteWidth = noteDuration * currentPixelsPerSecond;
          
          // MIDI 노트 번호를 lane.index로 변환 (C-1=0 → index=0, G9=127 → index=127)
          const laneIndex = note.note;
          const lane = lanes.find(l => l.index === laneIndex);
          
          if (lane) {
            const noteY = (lane.top / 100) * containerRect.height;
            const noteHeight = (lane.height / 100) * containerRect.height;
            
            // 선택 영역과 노트가 겹치는지 확인
            if (noteX + noteWidth >= minX && noteX <= maxX &&
                noteY + noteHeight >= minY && noteY <= maxY) {
              newSelectedNotes.add(index);
            }
          }
        });
      }
      
      // 서스테인 탭이 아닌 경우에만 노트 선택 처리
      if (isFromFooter && velocityTabSelection === 'sustain') {
        // 서스테인 탭에서 마키 선택 완료 (이미 위에서 처리됨)
      } else {
        // 최종 선택된 노트들 (Ctrl 키 상태에 따라 다름)
        const finalSelectedNotes = isCtrlPressedDuringMarqueeRef.current 
          ? new Set([...selectedNotes, ...newSelectedNotes])
          : newSelectedNotes;
        
        // 선택 업데이트
        setSelectedNotes(finalSelectedNotes);
        // 서스테인 선택 해제
        if (setSelectedSustainRange) {
          setSelectedSustainRange(new Set());
        }
        
        // Marquee 선택 완료 시 선택된 모든 노트의 소리 피드백 (새로 추가된 노트만)
        const newlyAddedNotes = isCtrlPressedDuringMarqueeRef.current
          ? Array.from(newSelectedNotes).filter(index => !selectedNotes.has(index))
          : Array.from(newSelectedNotes);
        
        if (newlyAddedNotes.length > 0 && audioEngineRef.current) {
          const project = getProject();
          const part = project.midiParts.find(p => p.id === partId);
          const track = part ? project.tracks.find(t => t.id === part.trackId) : null;
          const instrument = track?.instrument || 'piano';
          
          newlyAddedNotes.forEach(noteIndex => {
            const note = partNotes[noteIndex];
            if (note) {
              void audioEngineRef.current?.previewNote(note.note, note.velocity ?? 100, instrument);
            }
          });
        }
        
        // merge 모드일 때 드래그로 선택한 노트들을 merge
        if (ui.cursorMode === 'mergeByKey4' && finalSelectedNotes.size >= 2) {
          const noteIndices = Array.from(finalSelectedNotes).sort((a, b) => a - b);
          const result = mergeNotes(partId, noteIndices);

          if (result) {
            setPartNotes(getMidiPartNotes(partId));
            setSelectedNotes(new Set([result.mergedNoteIndex]));
          }
        }
      }
      
      setIsSelecting(false);
      setSelectionRect(null);
      
      // 마키 선택 소스 초기화 (약간의 지연을 두어 마우스 업 이벤트 처리 완료 후 초기화)
      // 이렇게 하면 마키 선택 완료 직후 오버레이 클릭 시 에디터가 닫히는 것을 방지
      // 마키 선택이 윈도우 안에서 시작되었다면, 마우스 업이 영역 밖에서 발생해도 에디터를 닫지 않음
      if (marqueeSelectionSourceRef) {
        setTimeout(() => {
          if (marqueeSelectionSourceRef) {
            marqueeSelectionSourceRef.current = null;
          }
        }, 100); // 100ms 지연으로 마키 선택 완료 직후 오버레이 클릭 시에도 보호
      }
    }
  }, [isResizingNote, ui, selectedNotes, isDragging, handleDragMouseUp, dragStartNotes, dragOffset, partId, bpm, timeSignature, isCtrlPressedDuringDrag, clampPianoPitch, setPartNotes, audioEngineRef, lastPreviewedPitchesRef, cancelDrag, setDragOffset, setClickedNoteIndex, dragStartPitchRef, setHoveredNote, isDrawing, drawingNote, setIsDrawing, setDrawingNote, isSelecting, selectionRect, pianoRollRef, velocityGraphAreaRef, velocityTabSelection, sustainRanges, setSelectedSustainRange, calculateLanePositions, partNotes, pixelsPerSecond, initialPixelsPerSecond, setSelectedNotes, setIsSelecting, setSelectionRect, isCtrlPressedDuringMarqueeRef, marqueeSelectionSourceRef, getTimeSignature, getPpqn]);

  useEffect(() => {
    if (!isSelecting || !selectionRect) return;
    if (marqueeSelectionSourceRef?.current !== 'pianoRoll') return;

    const handleWindowMouseUp = () => {
      handlePianoRollMouseUp();
    };

    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [isSelecting, selectionRect, marqueeSelectionSourceRef, handlePianoRollMouseUp]);

  return {
    handlePianoRollMouseUp,
  };
};

