import React from 'react';
import type { MidiNote, TempoEvent } from '../../types/project';
import { ticksToSecondsPure, secondsToTicksPure } from '../../utils/midiTickUtils';
import { selectProject } from '../../store/selectors';
import { MIDI_EDITOR_CONSTANTS } from '../../constants/ui';
import styles from './MidiEditor.module.css';

/**
 * 레인 위치 정보
 */
export interface LanePosition {
  index: number;
  top: number;
  height: number;
  isBlackKey: boolean;
}

/**
 * 노트 표시 정보
 */
export interface NoteDisplayInfo {
  note: MidiNote;
  index: number;
  startTime: number;
  duration: number;
}

/**
 * NoteLayer 컴포넌트 Props
 * Phase 7.3: 노트 렌더링 로직 분리
 */
export interface NoteLayerProps {
  /** 표시할 노트 정보 배열 */
  visibleNotes: NoteDisplayInfo[];
  /** 파트 ID */
  partId: string;
  /** 초당 픽셀 수 (줌 레벨) */
  pixelsPerSecond: number;
  /** 파트 지속 시간 (초) */
  partDuration: number;
  /** BPM */
  bpm: number;
  /** 타임 시그니처 */
  timeSignature: [number, number];
  /** PPQN (Pulses Per Quarter Note) */
  ppqn: number;
  /** 템포 맵 */
  tempoMap: TempoEvent[];
  /** 레인 위치 배열 */
  lanes: LanePosition[];
  /** 선택된 노트 인덱스 Set */
  selectedNotes: Set<number>;
  /** 드래그 중인지 여부 */
  isDragging: boolean;
  /** 드래그 시작 노트들 */
  dragStartNotes: Array<{ index: number; note: MidiNote }>;
  /** 드래그 오프셋 */
  dragOffset: { time: number; pitch: number };
  /** Ctrl 키가 드래그 중에 눌려있는지 여부 */
  isCtrlPressedDuringDrag: boolean;
  /** 리사이즈 중인 노트 인덱스 */
  resizingNoteIndex: number;
  /** 리사이즈 미리보기 */
  resizePreview: { startTick: number; durationTicks: number } | null;
  /** 호버된 리사이즈 핸들 인덱스 */
  hoveredResizeHandle: number | null;
  /** 그리기 중인 노트 */
  drawingNote: { note: number; startTime: number; endTime?: number } | null;
  /** 그리기 중인지 여부 */
  isDrawing: boolean;
  /** Split 미리보기 X 좌표 */
  splitPreviewX: number | null;
  /** Split 미리보기 노트 인덱스 */
  splitPreviewNoteIndex: number | null;
  /** 커서 모드 */
  cursorMode: 'splitByKey3Normal' | 'splitByKey3Quantized' | 'splitByAltNormal' | 'splitByAltQuantized' | 'mergeByKey4' | null;
  /** 벨로시티 색상 계산 함수 */
  getVelocityColor: (velocity: number, isBlackKey: boolean) => string;
  /** 벨로시티 테두리 색상 계산 함수 */
  getVelocityBorderColor: (velocity: number, isBlackKey: boolean) => string;
  /** Split 모드 확인 함수 */
  isSplitMode: (mode: 'splitByKey3Normal' | 'splitByKey3Quantized' | 'splitByAltNormal' | 'splitByAltQuantized' | 'mergeByKey4' | null) => boolean;
  /** 빨간색 테마 활성화 여부 (v 키로 토글, 선택된 노트에 적용) */
  isRedThemeActive?: boolean;
}

/**
 * NoteLayer 컴포넌트
 * Phase 7.3: MidiEditor의 노트 렌더링 로직을 담당하는 컴포넌트
 */
export const NoteLayer: React.FC<NoteLayerProps> = ({
  visibleNotes,
  partId,
  pixelsPerSecond,
  partDuration,
  bpm,
  timeSignature,
  ppqn,
  tempoMap,
  lanes,
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
  cursorMode,
  getVelocityColor,
  getVelocityBorderColor,
  isSplitMode,
  isRedThemeActive = false,
}) => {
  return (
    <>
      {/* 미디 노트 렌더링 */}
      {visibleNotes.map(({ note, index, startTime: noteStartTime, duration: noteDuration }) => {
        const noteEndTime = noteStartTime + noteDuration;

        if (noteEndTime <= 0 || noteStartTime >= partDuration) {
          return null;
        }

        const clippedStartTime = Math.max(0, noteStartTime);
        const clippedEndTime = Math.min(partDuration, noteEndTime);
        const clippedDuration = clippedEndTime - clippedStartTime;

        if (clippedDuration <= 0) {
          return null;
        }

        const isDragged = isDragging && dragStartNotes.some(dn => dn.index === index);
        const isResized = resizingNoteIndex === index;
        
        // 복제 모드일 때는 원본 노트는 그 자리에 표시 (드래그 오프셋 적용 안함)
        const isDuplicateMode = isDragged && isCtrlPressedDuringDrag;
        // 드래그 오프셋 적용 (복제 모드가 아닐 때만)
        const displayStartTime = isDragged && !isDuplicateMode ? clippedStartTime + dragOffset.time : clippedStartTime;
        const displayPitch = isDragged && !isDuplicateMode ? note.note + dragOffset.pitch : note.note;
        
        // 리사이즈 미리보기 적용
        let displayStartTimeForResize = displayStartTime;
        let displayDuration = clippedDuration;
        if (isResized && resizePreview) {
          const { startTime: previewStartTime, duration: previewDuration } = ticksToSecondsPure(
            resizePreview.startTick,
            resizePreview.durationTicks,
            tempoMap,
            timeSignature,
            ppqn
          );
          displayStartTimeForResize = previewStartTime;
          displayDuration = previewDuration;
        }
        
        const noteX = displayStartTimeForResize * pixelsPerSecond;
        const noteWidth = displayDuration * pixelsPerSecond;
        
        // MIDI 노트 번호를 lane.index로 변환
        const laneIndex = displayPitch;
        
        // 레인 위치에서 해당 반음의 위치 찾기
        const lane = lanes.find(l => l.index === laneIndex);
        
        if (!lane) return null;
        
        const noteY = lane.top;
        const noteHeight = lane.height;
        const isBlackKey = lane.isBlackKey;
        const isSelected = selectedNotes.has(index);
        
        // 고유 key 생성
        const uniqueKey = `${note.startTick}-${note.note}-${note.durationTicks}`;
        
        // 벨로시티 값 (기본값 100)
        const velocity = note.velocity ?? 100;
        
        // 벨로시티에 따른 색상 (선택된 노트는 더 어둡게)
        let noteColor: string;
        let borderColor: string;
        
        if (isSelected) {
          // 빨간색 테마가 활성화되어 있으면 주황색으로 표시 (더 부드러운 색상)
          if (isRedThemeActive) {
            if (isBlackKey) {
              noteColor = '#cc7a00'; // 어두운 주황색 (흑건반)
              borderColor = '#e68a00';
            } else {
              noteColor = '#ffa500'; // 밝은 주황색 (백건반)
              borderColor = '#ff8c00';
            }
          } else {
            // 선택된 노트: 벨로시티에 따라 채도 조정하되 더 어두운 톤
            const normalizedVelocity = Math.max(0, Math.min(127, velocity));
            const saturation = (normalizedVelocity / 127) * 100;
            
            if (isBlackKey) {
              // 선택된 흑건반: 더 어두운 톤
              const adjustedSaturation = (66 * saturation) / 100;
              noteColor = `hsl(214, ${adjustedSaturation}%, 35%)`;
              borderColor = `hsl(214, ${adjustedSaturation}%, 42%)`;
            } else {
              // 선택된 백건반: 더 어두운 톤
              noteColor = `hsl(214, ${saturation}%, 50%)`;
              borderColor = `hsl(214, ${saturation}%, 60%)`;
            }
          }
        } else {
          noteColor = getVelocityColor(velocity, isBlackKey);
          borderColor = getVelocityBorderColor(velocity, isBlackKey);
        }
        
        return (
          <div
            key={uniqueKey}
            className={`${styles.midiNote} ${isBlackKey ? styles.midiNoteBlack : ''} ${isSelected ? styles.midiNoteSelected : ''}`}
            style={{
              left: `${noteX}px`,
              width: `${noteWidth}px`,
              top: `${noteY}%`,
              height: `${noteHeight}%`,
              backgroundColor: noteColor,
              borderColor: borderColor,
              opacity: (isDragged || isResized) ? MIDI_EDITOR_CONSTANTS.NOTE_OPACITY_DRAGGING : MIDI_EDITOR_CONSTANTS.NOTE_OPACITY_NORMAL,
              cursor: (isSplitMode(cursorMode) && splitPreviewNoteIndex === index) ? 'none' : ((resizingNoteIndex === index || hoveredResizeHandle === index) ? 'ew-resize' : (isSelected ? 'grab' : 'pointer')),
            }}
          />
        );
      })}
      
      {/* 자를 위치 미리보기 선 */}
      {isSplitMode(cursorMode) && splitPreviewX !== null && splitPreviewNoteIndex !== null && (() => {
        // 노트 정보 가져오기 (visibleNotes에서 찾기)
        const noteInfo = visibleNotes.find(n => n.index === splitPreviewNoteIndex);
        if (!noteInfo) return null;
        
        const laneIndex = noteInfo.note.note;
        const lane = lanes.find(l => l.index === laneIndex);
        
        if (!lane) return null;
        
        const noteY = lane.top;
        const noteHeight = lane.height;
        
        return (
          <div
            key="split-preview-line"
            className={styles.splitPreviewLine}
            style={{
              position: 'absolute',
              left: `${splitPreviewX}px`,
              top: `${noteY}%`,
              width: '2px',
              height: `${noteHeight}%`,
              pointerEvents: 'none',
              zIndex: 20,
            }}
          />
        );
      })()}
      
      {/* 드래그 중인 노트 표시 */}
      {drawingNote && isDrawing && (() => {
        // gridSize 계산
        const beatUnit = timeSignature[1];
        const noteValueRatio = 4 / beatUnit;
        const secondsPerBeat = (60 / bpm) * noteValueRatio;
        const gridSize = secondsPerBeat;
        
        const noteX = drawingNote.startTime * pixelsPerSecond;
        const endTime = drawingNote.endTime !== undefined 
          ? drawingNote.endTime 
          : drawingNote.startTime + gridSize;
        const duration = Math.max(gridSize, endTime - drawingNote.startTime);
        const noteWidth = duration * pixelsPerSecond;
        
        // MIDI 노트 번호를 lane.index로 변환
        const laneIndex = drawingNote.note;
        
        // 레인 위치에서 해당 반음의 위치 찾기
        const lane = lanes.find(l => l.index === laneIndex);
        
        if (!lane) return null;
        
        const noteY = lane.top;
        const noteHeight = lane.height;
        const isBlackKey = lane.isBlackKey;
        
        return (
          <div
            key="drawing-note"
            className={`${styles.midiNoteDrawing} ${isBlackKey ? styles.midiNoteDrawingBlack : ''}`}
            style={{
              left: `${noteX}px`,
              width: `${noteWidth}px`,
              top: `${noteY}%`,
              height: `${noteHeight}%`,
            }}
          />
        );
      })()}
      
      {/* 복제 모드 미리보기 (Ctrl 키를 누른 상태로 드래그 중일 때) */}
      {isDragging && isCtrlPressedDuringDrag && dragStartNotes.length > 0 && dragOffset && (() => {
        return dragStartNotes.map(({ note: originalNote }, idx) => {
          // 시간 오프셋을 Tick으로 변환
          const originalStartTick = originalNote.startTick ?? 0;
          const originalDurationTicks = originalNote.durationTicks ?? 0;
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
          
          // Tick을 시간으로 변환
          const { startTime: newStartTime, duration: newDuration } = ticksToSecondsPure(
            newStartTick,
            originalDurationTicks,
            tempoMap,
            timeSignature,
            ppqn
          );
          
          const newPitch = Math.max(0, Math.min(127, originalNote.note + dragOffset.pitch));
          
          const noteX = newStartTime * pixelsPerSecond;
          const noteWidth = newDuration * pixelsPerSecond;
          
          // 레인 위치 찾기
          const laneIndex = newPitch;
          const lane = lanes.find(l => l.index === laneIndex);
          
          if (!lane) return null;
          
          const noteY = lane.top;
          const noteHeight = lane.height;
          const isBlackKey = lane.isBlackKey;
          
          // 파트 범위 확인
          const part = selectProject().midiParts.find(p => p.id === partId);
          if (!part) return null;
          if (newStartTick + originalDurationTicks > part.durationTicks) {
            return null;
          }
          
          // 벨로시티 값
          const velocity = originalNote.velocity ?? 100;
          const normalizedVelocity = Math.max(0, Math.min(127, velocity));
          const saturation = (normalizedVelocity / 127) * 100;
          
          let noteColor: string;
          let borderColor: string;
          
          if (isBlackKey) {
            const adjustedSaturation = (66 * saturation) / 100;
            noteColor = `hsl(214, ${adjustedSaturation}%, 35%)`;
            borderColor = `hsl(214, ${adjustedSaturation}%, 42%)`;
          } else {
            noteColor = `hsl(214, ${saturation}%, 50%)`;
            borderColor = `hsl(214, ${saturation}%, 60%)`;
          }
          
          return (
            <div
              key={`duplicate-preview-${idx}`}
              className={`${styles.midiNote} ${isBlackKey ? styles.midiNoteBlack : ''}`}
              style={{
                position: 'absolute',
                left: `${noteX}px`,
                width: `${noteWidth}px`,
                top: `${noteY}%`,
                height: `${noteHeight}%`,
                backgroundColor: noteColor,
                borderColor: borderColor,
                opacity: 0.6, // 미리보기는 반투명
                pointerEvents: 'none',
                zIndex: 15,
              }}
            />
          );
        }).filter(Boolean);
      })()}
    </>
  );
};

