import React, { useRef, useEffect } from 'react';
import styles from './EventDisplay.module.css';
import { subscribePlaybackTime } from '../../utils/playbackTimeStore';
import { EVENT_DISPLAY_CONSTANTS } from '../../constants/ui';
import { ticksToSecondsPure, getTimeSignature, getPpqn } from '../../utils/midiTickUtils';
import { getProject } from '../../store/projectStore';
import { findMidiPartsByTrackId, findMidiPartById } from '../../store/projectState';
import { isSplitMode } from '../../store/uiStore';
import { selectProject } from '../../store/selectors';
import { getRenderableNoteRange } from '../../utils/midiUtils';
import { measureToTime } from '../../store/projectStore';
import type { Track, MidiPart, MidiNote } from '../../types/project';

// 리사이즈 핸들 크기 (픽셀 단위, 줌 레벨과 무관하게 고정)
const RESIZE_HANDLE_WIDTH_PX = 15;

/**
 * TimelineView 컴포넌트 Props
 * Phase 9: EventDisplay 뷰 레이어 컴포넌트 생성
 */
export interface TimelineViewProps {
  /** Export 범위 시작 시간 (초, 선택) */
  exportRangeStart: number | null;
  /** Export 범위 종료 시간 (초, 선택) */
  exportRangeEnd: number | null;
  /** 시작 시간 (초) */
  startTime: number;
  /** 초당 픽셀 수 (줌 레벨) */
  pixelsPerSecond: number;
  /** 전체 너비 (픽셀) */
  totalWidth: number;
  /** 녹음 중 여부 */
  isRecording: boolean;
  /** 플레이헤드 드래그 시작 핸들러 */
  onPlayheadMouseDown: (e: React.MouseEvent) => void;
  /** 트랙 배열 */
  tracks: Track[];
  /** 트랙별 높이 맵 */
  trackHeights: Map<string, number>;
  /** 선택된 트랙 ID */
  selectedTrackId: string | null | undefined;
  /** 마디 마커 배열 */
  measureMarkers: Array<{ measure: number; x: number }>;
  /** 트랙 마우스 다운 핸들러 */
  onTrackMouseDown: (e: React.MouseEvent, trackId: string) => void;
  /** 트랙 클릭 핸들러 */
  onTrackClick: (e: React.MouseEvent) => void;
  /** Step 9.4.1: 기본 미디파트 클립 렌더링 props */
  /** BPM */
  bpm: number;
  /** 타임 시그니처 */
  timeSignature: [number, number];
  /** PPQN (Pulses Per Quarter Note) */
  ppqn: number;
  /** 드래그 중 여부 */
  isDraggingPart: boolean;
  /** 드래그 중인 파트 정보 */
  draggedPartsInfo: Array<{ partId: string; originalStartTick: number; originalTrackId: string }>;
  /** 드래그 오프셋 */
  partDragOffset: { x: number; y: number };
  /** 리사이즈 중 여부 */
  isResizingPart: boolean;
  /** 리사이즈 중인 파트 ID */
  resizePartId: string | null;
  /** 리사이즈 미리보기 */
  resizePreview: { startTick: number; durationTicks: number } | null;
  /** 리사이즈 시작 정보 (EventDisplay에서 계산한 원본 기준) */
  resizeStart: { originalStartTick: number; originalDurationTicks: number } | null;
  /** 리사이즈 방향 */
  resizeSide: 'left' | 'right' | null;
  /** 트랙 간 이동 모드 */
  isTrackMovingMode: boolean;
  /** 드래그 시작 정보 */
  partDragStart: { x: number; y: number; partStartTick: number; partTrackId: string; clickOffsetX: number } | null;
  /** 드래그 중 Ctrl 키 상태 */
  isCtrlPressedDuringDrag: boolean;
  /** 선택된 클립 ID들 */
  selectedClipIds: Set<string>;
  /** 호버된 파트 ID */
  hoveredPartId: string | null;
  /** 커서 모드 */
  cursorMode: 'splitByKey3Normal' | 'splitByKey3Quantized' | 'splitByAltNormal' | 'splitByAltQuantized' | 'mergeByKey4' | null;
  /** 퀀타이즈 활성화 여부 */
  isQuantizeEnabled: boolean;
  /** 컨텐츠 영역 ref */
  contentRef: React.RefObject<HTMLDivElement | null>;
  /** 이벤트 핸들러 */
  onPartClick: (partId: string, e: React.MouseEvent) => void;
  onPartDoubleClick: (partId: string, e: React.MouseEvent) => void;
  onPartMouseDown: (partId: string, e: React.MouseEvent) => void;
  onPartMouseEnter: (partId: string, e: React.MouseEvent) => void;
  onPartMouseLeave: (partId: string) => void;
  onPartMouseMove: (partId: string, e: React.MouseEvent) => void;
  onSetHoveredPartId: (partId: string | null) => void;
  onSetSplitPreviewX: (x: number | null) => void;
  onSetSplitPreviewPartId: (partId: string | null) => void;
  /** Step 9.4.3: Split 미리보기 선 props */
  splitPreviewX: number | null;
  splitPreviewPartId: string | null;
  /** Step 9.4.4: 드래그 미리보기 props */
  calculateDropPosition: () => { baseNewTrackId: string | null; partDropPositions: Array<{ partId: string; newStartTick: number; newTrackId: string }> } | null;
  /** Step 9.5: Ctrl+드래그 클립 생성 미리보기 props */
  isDragging: boolean;
  dragStart: { x: number; y: number; trackId: string } | null;
  dragCurrent: { x: number; y: number } | null;
}

/**
 * TimelineView 컴포넌트
 * EventDisplay의 렌더링 로직을 담당하는 뷰 레이어 컴포넌트
 * Phase 9: EventDisplay 뷰 레이어 컴포넌트 생성
 */
export const TimelineView: React.FC<TimelineViewProps> = ({
  exportRangeStart,
  exportRangeEnd,
  startTime,
  pixelsPerSecond,
  totalWidth,
  isRecording,
  onPlayheadMouseDown,
  tracks,
  trackHeights,
  selectedTrackId,
  measureMarkers,
  onTrackMouseDown,
  onTrackClick,
  // Step 9.4.1: 기본 미디파트 클립 렌더링 props
  bpm,
  timeSignature,
  ppqn,
  isDraggingPart,
  draggedPartsInfo,
  partDragOffset,
  isResizingPart,
  resizePartId,
  resizePreview,
  resizeStart,
  resizeSide,
  isTrackMovingMode,
  partDragStart,
  isCtrlPressedDuringDrag,
  selectedClipIds,
  hoveredPartId,
  cursorMode,
  isQuantizeEnabled: _isQuantizeEnabled,
  contentRef,
  onPartClick,
  onPartDoubleClick,
  onPartMouseDown,
  onPartMouseEnter,
  onPartMouseLeave,
  onPartMouseMove,
  onSetHoveredPartId: _onSetHoveredPartId,
  onSetSplitPreviewX: _onSetSplitPreviewX,
  onSetSplitPreviewPartId: _onSetSplitPreviewPartId,
  // Step 9.4.3: Split 미리보기 선 props
  splitPreviewX,
  splitPreviewPartId,
  // Step 9.4.4: 드래그 미리보기 props
  calculateDropPosition,
  // Step 9.5: Ctrl+드래그 클립 생성 미리보기 props
  isDragging,
  dragStart,
  dragCurrent,
}) => {
  // Step 9.2: 플레이헤드 ref 및 위치 업데이트
  const playheadRef = useRef<HTMLDivElement>(null);
  const playheadTargetRef = useRef(0);
  const playheadRenderRef = useRef<number | null>(null);
  const playheadRafRef = useRef<number | null>(null);
  const playheadPerfRef = useRef<number | null>(null);

  useEffect(() => {
    const updatePlayhead = (renderTime: number) => {
      if (!playheadRef.current) return;
      const x = (renderTime - startTime) * pixelsPerSecond;
      const isVisible = x >= 0 && x <= totalWidth;
      playheadRef.current.style.transform = `translateX(${x}px)`;
      playheadRef.current.style.opacity = isVisible ? '1' : '0';
      playheadRef.current.style.pointerEvents = isVisible ? 'auto' : 'none';
    };

    const tick = (now: number) => {
      playheadRafRef.current = null;
      const targetTime = playheadTargetRef.current;
      let renderTime = playheadRenderRef.current ?? targetTime;
      const lastPerf = playheadPerfRef.current;
      const elapsed = lastPerf ? Math.max(0, (now - lastPerf) / 1000) : 0;
      playheadPerfRef.current = now;

      const delta = targetTime - renderTime;
      const absDelta = Math.abs(delta);
      const maxStep = Math.max(0.01, elapsed * 2);

      if (absDelta > 1.5) {
        renderTime = targetTime;
      } else if (absDelta > maxStep) {
        renderTime += Math.sign(delta) * maxStep;
      } else {
        renderTime = targetTime;
      }

      playheadRenderRef.current = renderTime;
      updatePlayhead(renderTime);

      if (Math.abs(playheadTargetRef.current - renderTime) > 0.001) {
        playheadRafRef.current = requestAnimationFrame(tick);
      }
    };

    const unsubscribe = subscribePlaybackTime((time) => {
      playheadTargetRef.current = time;
      if (playheadRafRef.current === null) {
        playheadRafRef.current = requestAnimationFrame(tick);
      }
    });

    return () => {
      unsubscribe();
      if (playheadRafRef.current !== null) {
        cancelAnimationFrame(playheadRafRef.current);
        playheadRafRef.current = null;
      }
      playheadPerfRef.current = null;
      playheadRenderRef.current = null;
    };
  }, [pixelsPerSecond, startTime, totalWidth]);

  return (
    <>
      {/* Export 범위 오버레이 */}
      {exportRangeStart !== null && exportRangeEnd !== null && (() => {
        const rangeStartX = (exportRangeStart - startTime) * pixelsPerSecond;
        const rangeEndX = (exportRangeEnd - startTime) * pixelsPerSecond;
        const rangeLeft = Math.min(rangeStartX, rangeEndX);
        const rangeWidth = Math.abs(rangeEndX - rangeStartX);
        
        if (rangeLeft >= -totalWidth && rangeLeft <= totalWidth) {
          return (
            <>
              <div
                className={styles.exportRangeOverlay}
                style={{
                  left: `${rangeLeft}px`,
                  width: `${rangeWidth}px`,
                }}
              />
              {/* Left Locator Line */}
              <div
                className={styles.leftLocatorLine}
                style={{ left: `${rangeStartX}px` }}
              />
              {/* Right Locator Line */}
              <div
                className={styles.rightLocatorLine}
                style={{ left: `${rangeEndX}px` }}
              />
            </>
          );
        }
        return null;
      })()}
      
      {/* Left Locator만 있는 경우 */}
      {exportRangeStart !== null && exportRangeEnd === null && (() => {
        const rangeStartX = (exportRangeStart - startTime) * pixelsPerSecond;
        if (rangeStartX >= -totalWidth && rangeStartX <= totalWidth) {
          return (
            <div
              className={styles.leftLocatorLine}
              style={{ left: `${rangeStartX}px` }}
            />
          );
        }
        return null;
      })()}
      
      {/* Right Locator만 있는 경우 */}
      {exportRangeStart === null && exportRangeEnd !== null && (() => {
        const rangeEndX = (exportRangeEnd - startTime) * pixelsPerSecond;
        if (rangeEndX >= -totalWidth && rangeEndX <= totalWidth) {
          return (
            <div
              className={styles.rightLocatorLine}
              style={{ left: `${rangeEndX}px` }}
            />
          );
        }
        return null;
      })()}
      
      {/* Step 9.2: 플레이헤드 렌더링 */}
      <div
        ref={playheadRef}
        className={`${styles.playhead} ${isRecording ? styles.playheadRecording : ''}`}
        style={{ transform: 'translateX(0px)' }}
        onMouseDown={onPlayheadMouseDown}
      />
      
      {/* Step 9.3: 트랙 및 마디 구분선 렌더링 */}
      {/* Step 9.4.1: 기본 미디파트 클립 렌더링 */}
      {tracks.map((track) => {
        const trackHeight = trackHeights.get(track.id) || 70; // 기본값 70px
        
        return (
          <div 
            key={track.id} 
            className={`${styles.eventTrack} ${selectedTrackId === track.id ? styles.eventTrackFocused : ''}`}
            style={{ height: `${trackHeight}px`, minHeight: `${trackHeight}px` }}
            onMouseDown={(e) => {
              // 클립이 아닌 빈 공간을 클릭한 경우에만 처리
              if (e.target instanceof HTMLElement && e.target.closest(`.${styles.clip}`)) {
                return; // 클립 클릭은 클립 핸들러에서 처리
              }
              // Alt 키를 누르고 있을 때만 트랙 레인에서 처리 (새 클립 생성)
              // 마키 선택은 이벤트 디스플레이 레벨에서 처리하므로 이벤트 전파 허용
              if (e.altKey) {
                e.stopPropagation(); // Alt 키가 있을 때만 이벤트 전파 차단
                onTrackMouseDown(e, track.id);
              } else {
                // Alt 키가 없으면 이벤트를 전파하여 eventContent의 handleContentMouseDown이 처리하도록 함
                // stopPropagation을 호출하지 않아서 이벤트가 부모로 전파됨
                // 트랙 레인 클릭 시에도 마키 선택이 시작되도록 함
              }
            }}
            onClick={(e) => {
              // 클립이 아닌 빈 공간을 클릭한 경우에만 처리
              if (e.target instanceof HTMLElement && e.target.closest(`.${styles.clip}`)) {
                return; // 클립 클릭은 클립 핸들러에서 처리
              }
              onTrackClick(e);
            }}
          >
            {/* 마디 구분선 */}
            {measureMarkers.map((marker) => (
              <div
                key={`measure-${track.id}-${marker.measure}`}
                className={styles.measureDivider}
                style={{ left: `${marker.x}px` }}
              />
            ))}
            
            {/* Step 9.4.1: 기본 미디파트 클립 렌더링 */}
            {/* 인덱스를 사용하여 트랙별 파트 조회 */}
            {findMidiPartsByTrackId(track.id)
              .map(part => {
                  // Tick 기반 파트 렌더링 (SMF 표준 정합)
                  // props로 받은 timeSignature와 ppqn을 사용하여 타임 시그니처 변경 시 즉시 반영
                  const currentProject = getProject();
                  const partStartTick = part.startTick;
                  const partDurationTicks = part.durationTicks;
                  const projectTimeSignature = timeSignature || getTimeSignature(currentProject);
                  const projectPpqn = ppqn || getPpqn(currentProject);
                const tempoMap = currentProject.timing?.tempoMap ?? [];
                const { startTime: partStartTime, duration: partDuration } = ticksToSecondsPure(
                  partStartTick,
                  partDurationTicks,
                  tempoMap,
                  projectTimeSignature,
                  projectPpqn
                );
                
                const isDragged = isDraggingPart && draggedPartsInfo.some(info => info.partId === part.id);
                const shouldHideOriginal = isDragged && !isCtrlPressedDuringDrag;
                
                // 미디파트의 노트 가져오기
                const partNotes = part.notes || [];
                
                // 노트 범위 계산
                let minNote = Infinity;
                let maxNote = -Infinity;
                if (partNotes.length > 0) {
                  partNotes.forEach(note => {
                    minNote = Math.min(minNote, note.note);
                    maxNote = Math.max(maxNote, note.note);
                  });
                }
                
                const partHeight = trackHeight - 2;
                const noteRange = maxNote >= minNote ? (maxNote - minNote + 1) : 0;
                
                // 트랙 간 이동 모드일 때는 원래 트랙에서 숨김
                if (shouldHideOriginal && isTrackMovingMode && partDragStart && track.id === partDragStart.partTrackId) {
                  if (contentRef.current) {
                    let currentTrackId = partDragStart.partTrackId;
                    let accumulatedHeightForDrag = 0;
                    const dragY = partDragStart.y + partDragOffset.y;
                    
                    if (dragY < 0 && tracks.length > 0) {
                      currentTrackId = tracks[0].id;
                    } else {
                      let foundTrack = false;
                      for (const t of tracks) {
                        const tHeight = trackHeights.get(t.id) || 70;
                        const tTop = accumulatedHeightForDrag;
                        const tBottom = accumulatedHeightForDrag + tHeight;
                        
                        if (dragY >= tTop && dragY < tBottom) {
                          currentTrackId = t.id;
                          foundTrack = true;
                          break;
                        }
                        accumulatedHeightForDrag += tHeight;
                      }
                      
                      if (!foundTrack && tracks.length > 0) {
                        currentTrackId = tracks[tracks.length - 1].id;
                      }
                    }
                    
                    if (currentTrackId !== partDragStart.partTrackId) {
                      return null;
                    }
                  }
                }
                
                const baseX = partStartTime * pixelsPerSecond;
                const partX = shouldHideOriginal ? baseX + partDragOffset.x : baseX;
                
                // 리사이징 미리보기 적용
                let displayStartTick = part.startTick;
                let displayDurationTicks = part.durationTicks;
                if (isResizingPart && resizePartId === part.id && resizePreview) {
                  displayStartTick = resizePreview.startTick;
                  displayDurationTicks = resizePreview.durationTicks;
                }
                
                  // 상위 스코프의 변수 재사용 (props로 받은 timeSignature와 ppqn 사용)
                  const { startTime: displayStartTime, duration: displayDuration } = ticksToSecondsPure(
                    displayStartTick,
                    displayDurationTicks,
                    tempoMap,
                    projectTimeSignature,
                    projectPpqn
                  );
                const displayX = displayStartTime * pixelsPerSecond;
                const displayWidth = displayDuration * pixelsPerSecond;
                
                const partWidth = isResizingPart && resizePartId === part.id && resizePreview 
                  ? displayWidth 
                  : partDuration * pixelsPerSecond;
                const finalPartX = isResizingPart && resizePartId === part.id && resizePreview
                  ? displayX
                  : partX;
                
                const isSelected = selectedClipIds.has(part.id);
                const isHovered = hoveredPartId === part.id;
                const showScissors = isSplitMode(cursorMode) && isHovered;
                const shouldRenderResizeHandles = !isDragged && !isSplitMode(cursorMode);

                const displayPartDurationTicks = (isResizingPart && resizePartId === part.id && resizePreview)
                  ? resizePreview.durationTicks
                  : part.durationTicks;

                const getNoteY = (noteValue: number) => {
                  if (partNotes.length === 0 || noteRange === 0) return 0;
                  const normalized = (maxNote - noteValue) / noteRange;
                  return normalized * (partHeight - 4) + 2;
                };
                
                return (
                  <div
                    key={part.id}
                    className={`${styles.clip} ${isSelected ? styles.clipSelected : ''} ${showScissors ? styles.clipScissorsCursor : ''}`}
                    style={{
                      position: 'absolute',
                      left: `${finalPartX}px`,
                      width: `${partWidth}px`,
                      height: `${partHeight}px`,
                      // TimelineView 내부에서는 각 트랙 div가 이미 세로 위치를 갖고 있으므로,
                      // 클립은 트랙 내부 좌표계 기준으로 배치해야 함.
                      top: `1px`,
                      cursor: showScissors ? undefined : (isDragged ? 'grabbing' : 'grab'),
                      opacity: isDragged && !isTrackMovingMode ? EVENT_DISPLAY_CONSTANTS.PART_OPACITY_DRAGGING : (isResizingPart && resizePartId === part.id ? EVENT_DISPLAY_CONSTANTS.PART_OPACITY_RESIZING : EVENT_DISPLAY_CONSTANTS.PART_OPACITY_NORMAL),
                      zIndex: isDragged ? EVENT_DISPLAY_CONSTANTS.PART_Z_INDEX_DRAGGING : EVENT_DISPLAY_CONSTANTS.PART_Z_INDEX_NORMAL,
                    }}
                    onClick={(e) => {
                      onPartClick(part.id, e);
                    }}
                    onDoubleClick={(e) => {
                      onPartDoubleClick(part.id, e);
                    }}
                    onMouseDown={(e) => {
                      onPartMouseDown(part.id, e);
                    }}
                    onMouseEnter={(e) => {
                      onPartMouseEnter(part.id, e);
                    }}
                    onMouseLeave={() => {
                      onPartMouseLeave(part.id);
                    }}
                    onMouseMove={(e) => {
                      onPartMouseMove(part.id, e);
                    }}
                    title={showScissors ? "Alt+Click to split part" : "Click to select, Ctrl+Click for multi-select, Drag to move, double-click to edit, Alt+hover for split"}
                  >
                    {/* Step 9.4.3: 자를 위치 미리보기 선 */}
                    {showScissors && splitPreviewPartId === part.id && splitPreviewX !== null && (
                      <div
                        className={styles.splitPreviewLine}
                        style={{
                          position: 'absolute',
                          left: `${splitPreviewX - finalPartX}px`,
                          top: '0px',
                          width: '2px',
                          height: '100%',
                          pointerEvents: 'none',
                          zIndex: 20,
                        }}
                      />
                    )}
                    {/* 리사이즈 핸들 (왼쪽) */}
                    {shouldRenderResizeHandles && (
                      <div
                        className={styles.resizeHandle}
                        style={{
                          position: 'absolute',
                          left: `${-RESIZE_HANDLE_WIDTH_PX / 2}px`,
                          top: '0px',
                          width: `${RESIZE_HANDLE_WIDTH_PX}px`,
                          height: '100%',
                          cursor: 'ew-resize',
                          zIndex: 15,
                        }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          onPartMouseDown(part.id, e);
                        }}
                      />
                    )}
                    {/* 리사이즈 핸들 (오른쪽) */}
                    {shouldRenderResizeHandles && (
                      <div
                        className={styles.resizeHandle}
                        style={{
                          position: 'absolute',
                          right: `${-RESIZE_HANDLE_WIDTH_PX / 2}px`,
                          top: '0px',
                          width: `${RESIZE_HANDLE_WIDTH_PX}px`,
                          height: '100%',
                          cursor: 'ew-resize',
                          zIndex: 15,
                        }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          onPartMouseDown(part.id, e);
                        }}
                      />
                    )}
                    {/* 노트 미리보기는 Step 9.4.2에서 추가 */}
                    {partNotes.length > 0 && displayPartDurationTicks > 0 ? (
                      <div className={styles.clipNotesPreview}>
                        {(() => {
                          let renderedCount = 0;
                          const nodes = partNotes.map((note, index) => {
                            let noteStartTickRelative = note.startTick;
                            let noteDurationTicks = note.durationTicks ?? 0;

                            // 왼쪽 리사이즈 미리보기 중: 노트의 절대 시작이 새 파트 시작보다 앞에 있으면 밀어내거나 숨김
                            let shouldHideNote = false;
                            if (isResizingPart && resizePartId === part.id && resizePreview && resizeStart && resizeSide === 'left') {
                              const originalPartStartTick = resizeStart.originalStartTick;
                              const newPartStartTick = resizePreview.startTick;

                              // 노트의 상대 위치가 음수일 때는 현재 파트의 시작 위치를 사용해야 함
                              let absoluteNoteStartTick: number;
                              if (noteStartTickRelative < 0) {
                                absoluteNoteStartTick = part.startTick + noteStartTickRelative;
                              } else {
                                absoluteNoteStartTick = originalPartStartTick + noteStartTickRelative;
                              }
                              const absoluteNoteEndTick = absoluteNoteStartTick + noteDurationTicks;

                              if (absoluteNoteStartTick < newPartStartTick) {
                                if (absoluteNoteEndTick <= newPartStartTick) {
                                  shouldHideNote = true;
                                } else {
                                  noteStartTickRelative = 0;
                                  noteDurationTicks = absoluteNoteEndTick - newPartStartTick;
                                }
                              } else {
                                noteStartTickRelative = absoluteNoteStartTick - newPartStartTick;
                                const newRelativeEndTick = absoluteNoteEndTick - newPartStartTick;
                                if (newRelativeEndTick > displayPartDurationTicks) {
                                  noteDurationTicks = displayPartDurationTicks - noteStartTickRelative;
                                }
                              }
                            }

                            if (shouldHideNote) return null;
                            if (noteDurationTicks <= 0) return null;

                            const noteEndTickRelative = noteStartTickRelative + noteDurationTicks;
                            // 파트 범위 밖이면 렌더링하지 않음
                            if (noteEndTickRelative <= 0 || noteStartTickRelative >= displayPartDurationTicks) return null;

                            // 파트 범위로 클리핑
                            const clippedStartTick = Math.max(0, noteStartTickRelative);
                            const clippedEndTick = Math.min(displayPartDurationTicks, noteEndTickRelative);
                            const clippedDurationTicks = clippedEndTick - clippedStartTick;
                            if (clippedDurationTicks <= 0) return null;

                            const noteX = (clippedStartTick / displayPartDurationTicks) * 100;
                            const noteWidth = Math.max(1, (clippedDurationTicks / displayPartDurationTicks) * 100);
                            const noteY = getNoteY(note.note);
                            const noteHeight = Math.max(1, partHeight / (noteRange + 1));

                            renderedCount += 1;
                            return (
                              <div
                                key={index}
                                className={styles.clipNote}
                                style={{
                                  left: `${noteX}%`,
                                  top: `${noteY}px`,
                                  width: `${noteWidth}%`,
                                  height: `${noteHeight}px`,
                                }}
                              />
                            );
                          });

                          return nodes;
                        })()}
                      </div>
                    ) : (
                      <div className={styles.clipContent}>MIDI</div>
                    )}
                  </div>
                );
              })}
              
              {/* Step 9.4.4: 드래그 중인 클립들이 다른 트랙으로 이동 중일 때 미리보기 */}
              {isDraggingPart && partDragStart && (() => {
                const dropPosition = calculateDropPosition();
                if (!dropPosition) {
                  return null;
                }

                const { baseNewTrackId, partDropPositions } = dropPosition;
                
                if (!baseNewTrackId) {
                  return null;
                }
                
                const hasPartDroppingToThisTrack = partDropPositions.some(({ newTrackId }) => newTrackId === track.id);
                if (!hasPartDroppingToThisTrack) {
                  return null;
                }
                
                if (!isCtrlPressedDuringDrag) {
                  const allPartsFromThisTrack = partDropPositions
                    .filter(({ newTrackId }) => newTrackId === track.id)
                    .every(({ partId }) => {
                      const originalTrackId = draggedPartsInfo.find(info => info.partId === partId)?.originalTrackId;
                      return originalTrackId === track.id;
                    });
                  if (allPartsFromThisTrack && track.id === partDragStart.partTrackId) {
                    return null;
                  }
                  
                  if (track.id === partDragStart.partTrackId) {
                    return null;
                  }
                }
                
                const project = selectProject();
                const previewParts: React.ReactNode[] = [];
                
                partDropPositions.forEach(({ partId, newStartTick, newTrackId }) => {
                  const part = findMidiPartById(partId);
                  if (!part) return;
                  
                  const originalTrackId = draggedPartsInfo.find(info => info.partId === partId)?.originalTrackId;
                  
                  if (!isCtrlPressedDuringDrag && part.trackId === newTrackId && part.trackId === track.id) {
                    return;
                  }
                  
                    if (newTrackId === track.id && (isCtrlPressedDuringDrag || originalTrackId !== track.id)) {
                     // props로 받은 timeSignature와 ppqn을 사용하여 타임 시그니처 변경 시 즉시 반영
                     const dragProjectTimeSignature = timeSignature || getTimeSignature(project);
                     const dragPpqn = ppqn || getPpqn(project);
                    const dragTempoMap = project.timing?.tempoMap ?? [];
                    const { startTime: newStartTime, duration: partDuration } = ticksToSecondsPure(
                      newStartTick,
                      part.durationTicks,
                      dragTempoMap,
                      dragProjectTimeSignature,
                      dragPpqn
                    );
                    const partX = newStartTime * pixelsPerSecond;
                    const partWidth = partDuration * pixelsPerSecond;
                    const draggedPartHeight = trackHeight - 2;
                    
                    const draggedPartNotes = part.notes || [];
                    let draggedMinNote = Infinity;
                    let draggedMaxNote = -Infinity;
                    if (draggedPartNotes.length > 0) {
                      draggedPartNotes.forEach((note: MidiNote) => {
                        draggedMinNote = Math.min(draggedMinNote, note.note);
                        draggedMaxNote = Math.max(draggedMaxNote, note.note);
                      });
                    }
                    const draggedNoteRange = draggedMaxNote >= draggedMinNote ? (draggedMaxNote - draggedMinNote + 1) : 0;
                    
                    const getDraggedNoteY = (noteValue: number) => {
                      if (draggedPartNotes.length === 0 || draggedNoteRange === 0) return 0;
                      const normalized = (draggedMaxNote - noteValue) / draggedNoteRange;
                      return normalized * (draggedPartHeight - 4) + 2;
                    };
                    
                    previewParts.push(
                      <div
                        key={`drag-preview-${partId}`}
                        className={styles.clip}
                        style={{
                          position: 'absolute',
                          left: `${partX}px`,
                          width: `${partWidth}px`,
                          height: `${draggedPartHeight}px`,
                          top: `1px`,
                          cursor: 'grabbing',
                          opacity: EVENT_DISPLAY_CONSTANTS.PART_OPACITY_DRAGGING,
                          zIndex: EVENT_DISPLAY_CONSTANTS.PART_Z_INDEX_DRAGGING,
                        }}
                      >
                        {draggedPartNotes.length > 0 ? (
                          <div className={styles.clipNotesPreview}>
                            {draggedPartNotes.map((note: MidiNote, index: number) => {
                              const tempPart: MidiPart = {
                                ...part,
                                startTick: newStartTick,
                                durationTicks: part.durationTicks
                              };
                              
                              const renderRange = getRenderableNoteRange(note, tempPart, bpm, timeSignature, ppqn);
                              
                              if (!renderRange) {
                                return null;
                              }
                              
                              const { startTime: noteStartTime, duration: noteDuration } = measureToTime(
                                renderRange.measureStart,
                                renderRange.measureDuration,
                                bpm,
                                timeSignature
                              );
                              
                              const noteX = (noteStartTime / partDuration) * 100;
                              const noteY = getDraggedNoteY(note.note);
                              const noteWidth = Math.max(1, (noteDuration / partDuration) * 100);
                              const noteHeight = Math.max(1, draggedPartHeight / (draggedNoteRange + 1));
                              
                              return (
                                <div
                                  key={index}
                                  className={styles.clipNote}
                                  style={{
                                    left: `${noteX}%`,
                                    top: `${noteY}px`,
                                    width: `${noteWidth}%`,
                                    height: `${noteHeight}px`,
                                  }}
                                />
                              );
                            })}
                          </div>
                        ) : (
                          <div className={styles.clipContent}>
                            MIDI
                          </div>
                        )}
                      </div>
                    );
                  }
                });
                
                return previewParts.length > 0 ? <>{previewParts}</> : null;
              })()}
              
              {/* Step 9.5: Ctrl+드래그 클립 생성 미리보기 */}
              {isDragging && dragStart && dragCurrent && dragStart.trackId === track.id && (
                <div
                  className={styles.clipPreview}
                  style={{
                    position: 'absolute',
                    left: `${Math.min(dragStart.x, dragCurrent.x)}px`,
                    width: `${Math.abs(dragCurrent.x - dragStart.x)}px`,
                    height: `${trackHeight - 2}px`,
                    top: `1px`, // TimelineView 내부에서는 각 트랙 div가 이미 세로 위치를 갖고 있으므로, 클립은 트랙 내부 좌표계 기준으로 배치
                  }}
                />
              )}
              
              {/* Step 9.5: 마키선택 영역은 EventDisplay의 eventContent 레벨에서 렌더링 */}
          </div>
        );
      })}
    </>
  );
};

