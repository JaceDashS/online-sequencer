import React, { useMemo } from 'react';
import styles from './MidiEditor.module.css';
import { MIDI_EDITOR_CONSTANTS } from '../../constants/ui';
import { ticksToSecondsPure, getTimeSignature, getPpqn } from '../../utils/midiTickUtils';
import { getProject } from '../../store/projectStore';
import type { MidiPart } from '../../types/project';
import type { UIState } from '../../store/uiStore';
import { isSplitMode } from '../../store/uiStore';
import type { VisibleNote, SustainRange } from '../../hooks/useMidiEditorData';
import { getVelocityColor, getVelocityBorderColor } from './MidiEditorCalculations';

/**
 * EditorFooter 컴포넌트 Props
 */
export interface EditorFooterProps {
  partId: string;
  part: MidiPart | null;
  visibleNotes: VisibleNote[];
  sustainRanges: SustainRange[];
  displayedSustainRanges: SustainRange[];
  velocityTabSelection: 'velocity' | 'sustain';
  setVelocityTabSelection: (tab: 'velocity' | 'sustain') => void;
  contentWidth: number;
  pixelsPerSecond: number | null;
  initialPixelsPerSecond: number;
  partDuration: number;
  bpm: number;
  timeSignature: [number, number];
  pianoRollContainerRef: React.RefObject<HTMLDivElement | null>;
  velocityDisplayRef: React.RefObject<HTMLDivElement | null>;
  velocityGraphAreaRef: React.RefObject<HTMLDivElement | null>;
  // 벨로시티 조정 관련
  setIsAdjustingVelocity?: (value: boolean) => void;
  setAdjustingVelocityNoteIndex?: (value: number) => void;
  setVelocityAdjustStartPos?: (value: { y: number; originalVelocity: number } | null) => void;
  // 미리보기 벨로시티 (드래그 중 UI 업데이트용)
  previewVelocity?: { noteIndex: number; velocity: number } | null;
  // 선택된 노트 인덱스 Set
  selectedNotes: Set<number>;
  // 빨간색 테마 활성화 여부 (v 키로 토글, 선택된 노트의 벨로시티 바에 적용)
  isRedThemeActive?: boolean;
  // 서스테인 페달 관련
  selectedSustainRange: Set<number>;
  setSelectedSustainRange: (value: Set<number> | ((prev: Set<number>) => Set<number>)) => void;
  isDrawingSustain: boolean;
  setIsDrawingSustain: (value: boolean) => void;
  drawingSustain: { startTime: number; endTime?: number } | null;
  setDrawingSustain: (value: { startTime: number; endTime?: number } | null) => void;
  isDraggingSustainRange: boolean;
  setIsDraggingSustainRange: (value: boolean) => void;
  sustainDragStart: { mouseX: number; startTick: number; endTick: number } | null;
  setSustainDragStart: (value: { mouseX: number; startTick: number; endTick: number } | null) => void;
  sustainDragPreview: { startTick: number; endTick: number } | null;
  setSustainDragPreview: (value: { startTick: number; endTick: number } | null) => void;
  isResizingSustainRange: boolean;
  setIsResizingSustainRange: (value: boolean) => void;
  sustainResizeStart: { mouseX: number; startTick: number; endTick: number; edge: 'left' | 'right' } | null;
  setSustainResizeStart: (value: { mouseX: number; startTick: number; endTick: number; edge: 'left' | 'right' } | null) => void;
  sustainResizePreview: { startTick: number; endTick: number } | null;
  setSustainResizePreview: (value: { startTick: number; endTick: number } | null) => void;
  // 기타
  ui: UIState;
  quantizeNote: (time: number, gridSize: number) => number;
  // Marquee Selection 관련 (푸터에서도 마키 선택 가능하도록)
  isSelecting?: boolean;
  selectionRect?: { startX: number; startY: number; endX: number; endY: number } | null;
  setIsSelecting?: (value: boolean) => void;
  setSelectionRect?: (value: { startX: number; startY: number; endX: number; endY: number } | null) => void;
  setSelectedNotes?: (notes: Set<number>) => void;
  isCtrlPressedDuringMarqueeRef?: React.MutableRefObject<boolean>;
  partNotes?: Array<{ note: number; startTick: number; durationTicks?: number; velocity?: number }>;
  marqueeSelectionSourceRef?: React.MutableRefObject<'pianoRoll' | 'footer' | null>;
}

/**
 * EditorFooter 컴포넌트
 * 벨로시티 탭 및 서스테인 페달 표시를 담당합니다.
 */
export const EditorFooter: React.FC<EditorFooterProps> = React.memo(({
  part,
  visibleNotes,
  sustainRanges,
  displayedSustainRanges,
  velocityTabSelection,
  setVelocityTabSelection,
  contentWidth,
  pixelsPerSecond,
  initialPixelsPerSecond,
  partDuration,
  bpm,
  timeSignature,
  pianoRollContainerRef,
  velocityDisplayRef,
  velocityGraphAreaRef,
  setIsAdjustingVelocity,
  setAdjustingVelocityNoteIndex,
  setVelocityAdjustStartPos,
  previewVelocity,
  selectedNotes,
  isRedThemeActive = false,
  selectedSustainRange,
  setSelectedSustainRange,
  isDrawingSustain,
  setIsDrawingSustain,
  drawingSustain,
  setDrawingSustain,
  isDraggingSustainRange: _isDraggingSustainRange,
  setIsDraggingSustainRange,
  sustainDragStart: _sustainDragStart,
  setSustainDragStart,
  sustainDragPreview: _sustainDragPreview,
  setSustainDragPreview,
  isResizingSustainRange: _isResizingSustainRange,
  setIsResizingSustainRange,
  sustainResizeStart: _sustainResizeStart,
  setSustainResizeStart,
  sustainResizePreview: _sustainResizePreview,
  setSustainResizePreview,
  ui,
  quantizeNote,
  isSelecting,
  selectionRect,
  setIsSelecting,
  setSelectionRect,
  setSelectedNotes,
  isCtrlPressedDuringMarqueeRef,
  marqueeSelectionSourceRef,
}) => {
  if (!part) return null;

  // Tick 기반으로 시간 계산 (SMF 표준 정합)
  const partStartTime = useMemo(() => {
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
  const pianoKeysWidth = MIDI_EDITOR_CONSTANTS.PIANO_KEYS_WIDTH; // 80px

  return (
    <div className={styles.editorFooter}>
      <div ref={velocityDisplayRef} className={styles.velocityDisplay} style={{ position: 'relative' }}>
        {/* 벨로시티 바 그래프 영역 - 각 노트의 위치에 맞춰 벨로시티 표시 */}
        {/* 탭 선택 영역 (왼쪽, 건반 너비만큼) - 스크롤 영역 밖으로 이동 */}
        <div 
          className={styles.velocityTabSelector}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: `${pianoKeysWidth}px`,
            height: '100%',
            backgroundColor: 'var(--bg-secondary)',
            borderRight: '1px solid var(--border-color)',
            zIndex: 10,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <button
            className={`${styles.velocityTabButton} ${velocityTabSelection === 'velocity' ? styles.velocityTabButtonActive : ''}`}
            onClick={() => setVelocityTabSelection('velocity')}
            style={{
              flex: 1,
              fontSize: '12px',
              padding: '8px',
              border: 'none',
              borderBottom: '1px solid var(--border-color)',
              backgroundColor: velocityTabSelection === 'velocity' ? 'var(--text-secondary)' : 'var(--bg-tertiary)',
              color: velocityTabSelection === 'velocity' ? 'var(--bg-primary)' : 'var(--text-tertiary)',
              cursor: 'pointer',
              transition: 'background-color 0.2s ease, color 0.2s ease',
            }}
            title="Velocity"
          >
            Velocity
          </button>
          <button
            className={`${styles.velocityTabButton} ${velocityTabSelection === 'sustain' ? styles.velocityTabButtonActive : ''}`}
            onClick={() => setVelocityTabSelection('sustain')}
            style={{
              flex: 1,
              fontSize: '12px',
              padding: '8px',
              border: 'none',
              backgroundColor: velocityTabSelection === 'sustain' ? 'var(--text-secondary)' : 'var(--bg-tertiary)',
              color: velocityTabSelection === 'sustain' ? 'var(--bg-primary)' : 'var(--text-tertiary)',
              cursor: 'pointer',
              transition: 'background-color 0.2s ease, color 0.2s ease',
            }}
            title="Sustain Pedal"
          >
            Sustain
          </button>
        </div>
        
        {/* 스크롤 가능한 벨로시티 그래프 영역 */}
        <div 
          ref={velocityGraphAreaRef}
          style={{ 
            width: `calc(100% - ${pianoKeysWidth}px)`,
            height: '100%',
            position: 'relative',
            overflow: 'hidden',
            marginLeft: `${pianoKeysWidth}px`,
            boxSizing: 'border-box'
          }}
          onWheel={(e) => {
            // 벨로시티 영역에서 스크롤 신호를 레인 영역으로만 전달
            // 벨로시티 영역 자체는 스크롤하지 않음 (overflow: hidden)
            const container = pianoRollContainerRef.current;
            if (!container) return;
            const delta = e.deltaX !== 0 ? e.deltaX : (e.shiftKey ? e.deltaY : 0);
            if (delta === 0) return;
            e.preventDefault();
            e.stopPropagation();
            const scrollLeftBefore = container.scrollLeft;
            const maxScrollLeft = container.scrollWidth - container.clientWidth;
            const nextScrollLeft = Math.max(0, Math.min(scrollLeftBefore + delta, maxScrollLeft));
            container.scrollLeft = nextScrollLeft;
          }}
        >
          {/* 벨로시티/서스테인 바들 */}
          <div 
            className={styles.velocityGraphContainer} 
            style={{ 
              position: 'relative',
              width: `${contentWidth + 1}px`, 
              height: '100%',
              minHeight: '90px',
            }}
            onMouseDown={(e) => {
              // 벨로시티 탭 또는 서스테인 탭에서 빈 공간을 클릭한 경우 마키 선택 시작
              if ((velocityTabSelection === 'velocity' || velocityTabSelection === 'sustain') && e.button === 0 && setIsSelecting && setSelectionRect) {
                const target = e.target as HTMLElement;
                
                // 벨로시티 탭: 벨로시티 바 클릭이 아닌지 확인
                if (velocityTabSelection === 'velocity' && target.closest(`.${styles.velocityBarInFooter}`)) {
                  return; // 벨로시티 바 클릭은 기존 동작 유지 (벨로시티 조정)
                }
                
                // 서스테인 탭: 서스테인 범위 클릭 처리
                if (velocityTabSelection === 'sustain') {
                  const rangeEl = target.closest('[data-sustain-range-index]') as HTMLElement | null;
                  const resizeEl = target.closest('[data-sustain-resize]') as HTMLElement | null;
                  
                  // 서스테인 범위 클릭: 선택 및 드래그/리사이즈 시작
                  if (rangeEl) {
                    const rangeIndex = Number(rangeEl.getAttribute('data-sustain-range-index'));
                    const range = sustainRanges[rangeIndex];
                    if (!Number.isNaN(rangeIndex) && range) {
                      const rect = velocityGraphAreaRef.current?.getBoundingClientRect();
                      if (rect) {
                        const x = e.clientX - rect.left;
                        
                        // 리사이즈 핸들 클릭: 리사이즈 시작 (Alt 키와 무관)
                        // 리사이즈 핸들 클릭 시 해당 범위를 선택하고 리사이즈 시작
                        if (resizeEl) {
                          const edge = resizeEl.getAttribute('data-sustain-resize') === 'left' ? 'left' : 'right';
                          // 리사이즈 핸들 클릭 시 해당 범위 선택 (단일 선택)
                          setSelectedSustainRange(new Set([rangeIndex]));
                          // 노트 선택 해제
                          if (setSelectedNotes) {
                            setSelectedNotes(new Set());
                          }
                          setIsResizingSustainRange(true);
                          setSustainResizeStart({
                            mouseX: x,
                            startTick: range.startTick,
                            endTick: range.endTick,
                            edge,
                          });
                          setSustainResizePreview({ startTick: range.startTick, endTick: range.endTick });
                          e.preventDefault();
                          e.stopPropagation();
                          return;
                        }
                        
                        // Alt 키를 누른 상태에서 서스테인 범위 클릭: 드래그 시작 (기존 동작 유지)
                        if ((e.altKey || isSplitMode(ui.cursorMode)) && selectedSustainRange.has(rangeIndex) && selectedSustainRange.size === 1) {
                          setIsDraggingSustainRange(true);
                          setSustainDragStart({
                            mouseX: x,
                            startTick: range.startTick,
                            endTick: range.endTick,
                          });
                          setSustainDragPreview({ startTick: range.startTick, endTick: range.endTick });
                          e.preventDefault();
                          e.stopPropagation();
                          return;
                        }
                        
                        // Alt 키 없이 서스테인 범위 클릭: 선택 또는 드래그 시작
                        if (!(e.altKey || isSplitMode(ui.cursorMode))) {
                          // Ctrl 키가 눌려있으면 선택에 추가/제거, 아니면 단일 선택 또는 드래그 시작
                          if (e.ctrlKey || e.metaKey) {
                            // 추가 선택: 이미 선택된 것이면 해제, 아니면 추가
                            setSelectedSustainRange(prev => {
                              const next = new Set(prev);
                              if (next.has(rangeIndex)) {
                                next.delete(rangeIndex);
                              } else {
                                next.add(rangeIndex);
                              }
                              return next;
                            });
                          } else {
                            // 일반 클릭: 이미 선택되어 있으면 드래그 시작, 아니면 선택
                            if (selectedSustainRange.has(rangeIndex) && selectedSustainRange.size === 1) {
                              // 이미 선택되어 있으면 드래그 시작
                              setIsDraggingSustainRange(true);
                              setSustainDragStart({
                                mouseX: x,
                                startTick: range.startTick,
                                endTick: range.endTick,
                              });
                              setSustainDragPreview({ startTick: range.startTick, endTick: range.endTick });
                            } else {
                              // 선택되어 있지 않으면 선택
                              setSelectedSustainRange(new Set([rangeIndex]));
                              // 노트 선택 해제
                              if (setSelectedNotes) {
                                setSelectedNotes(new Set());
                              }
                            }
                          }
                          e.preventDefault();
                          e.stopPropagation();
                          return;
                        }
                      }
                    }
                  }
                  
                  // Alt + 빈 공간 클릭/드래그: 서스테인 페달 그리기 시작
                  if (e.altKey || isSplitMode(ui.cursorMode)) {
                    const rect = velocityGraphAreaRef.current?.getBoundingClientRect();
                    if (!rect) return;
                    const x = e.clientX - rect.left;
                    const time = x / (pixelsPerSecond || initialPixelsPerSecond);
                    const relativeTime = Math.max(0, Math.min(partDuration, time));
                    // 그리드 크기 계산
                    const beatUnit = timeSignature[1];
                    const noteValueRatio = 4 / beatUnit;
                    const secondsPerBeat = (60 / bpm) * noteValueRatio;
                    const gridSize = secondsPerBeat;
                    // 퀀타이즈 적용 (마디 기준)
                    const startTime = ui.isQuantizeEnabled 
                      ? quantizeNote(partStartTime + relativeTime, gridSize) - partStartTime
                      : relativeTime;
                  
                    // 클릭 시작 (드래그 여부는 useSustainPedal에서 감지)
                    setIsDrawingSustain(true);
                    setDrawingSustain({ startTime });
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                  }
                }
                
                // Alt 키가 눌려있지 않은 경우: 마키 선택 시작 (서스테인 탭에서도 빈 공간 클릭 시)
                // velocityGraphAreaRef는 marginLeft: pianoKeysWidth가 이미 적용되어 있으므로
                // getBoundingClientRect()는 이미 오프셋된 위치를 반환합니다.
                // 마키 선택 영역은 velocityGraphContainer 내부에 표시되므로,
                // velocityGraphAreaRef 기준으로 좌표를 계산하면 됩니다.
                const rect = velocityGraphAreaRef.current?.getBoundingClientRect();
                if (!rect) return;
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                
                // Ctrl 키 상태 저장
                const isCtrlPressed = e.ctrlKey || e.metaKey;
                if (isCtrlPressedDuringMarqueeRef) {
                  isCtrlPressedDuringMarqueeRef.current = isCtrlPressed;
                }
                
                // 푸터에서 마키 선택 시작 표시
                if (marqueeSelectionSourceRef) {
                  marqueeSelectionSourceRef.current = 'footer';
                }
                
                setIsSelecting(true);
                setSelectionRect({ startX: x, startY: y, endX: x, endY: y });
                
                // 서스테인 탭에서 마키 선택 시작 시 Ctrl 키가 눌려있지 않으면 기존 선택 해제
                if (velocityTabSelection === 'sustain' && !isCtrlPressed) {
                  setSelectedSustainRange(new Set());
                }
                
                // Ctrl 키가 눌려있지 않으면 기존 선택 해제 (벨로시티 탭)
                if (velocityTabSelection === 'velocity' && !isCtrlPressed && setSelectedNotes) {
                  setSelectedNotes(new Set());
                }
                
                e.preventDefault();
                e.stopPropagation();
                return;
              }
            }}
          >
            {/* 그리드 표시 */}
            {(() => {
              // 글로벌 기준으로 그리드 계산
              const beatsPerMeasure = timeSignature[0];
              const beatUnit = timeSignature[1];
              const noteValueRatio = 4 / beatUnit;
              const secondsPerBeat = (60 / bpm) * noteValueRatio;
              const gridSize = secondsPerBeat; // 1박자 단위 (4/4의 경우 4분음표 단위)
              const secondsPerMeasure = beatsPerMeasure * secondsPerBeat;
              
              // 클립의 시작 시간을 고려하여 그리드 생성
              const startGridIndex = Math.floor(partStartTime / gridSize);
              const endGridIndex = Math.ceil((partStartTime + partDuration) / gridSize);
              const gridLines = [];
              
              for (let i = startGridIndex; i <= endGridIndex; i++) {
                const gridTime = i * gridSize;
                // 클립 내부의 상대 시간으로 변환
                const relativeTime = gridTime - partStartTime;
                if (relativeTime >= 0 && relativeTime <= partDuration) {
                  const currentPixelsPerSecond = pixelsPerSecond || initialPixelsPerSecond;
                  const x = relativeTime * currentPixelsPerSecond;
                  // 마디 경계인지 확인 (글로벌 시간 기준)
                  const timeInMeasure = gridTime % secondsPerMeasure;
                  const isMeasureBoundary = Math.abs(timeInMeasure) < MIDI_EDITOR_CONSTANTS.FLOAT_EPSILON;
                  
                  gridLines.push(
                    <div
                      key={`velocity-grid-${i}`}
                      className={`${styles.gridLine} ${isMeasureBoundary ? styles.gridLineStrong : ''}`}
                      style={{ 
                        left: `${x}px`,
                        top: `0px`,
                      }}
                    />
                  );
                }
              }
              
              return gridLines;
            })()}
            {/* 벨로시티 표시 */}
            {velocityTabSelection === 'velocity' && visibleNotes.map(({ note, index, startTime: noteStartTime }) => {
              // Tick 기반으로 노트 위치 계산 (SMF 표준 정합)
              // 노트는 파트 내부의 상대 위치로 저장되어 있음
              const noteX = noteStartTime * (pixelsPerSecond || initialPixelsPerSecond);
              // 미리보기 벨로시티가 있으면 사용, 없으면 노트의 실제 벨로시티 사용
              const velocity = (previewVelocity?.noteIndex === index) 
                ? previewVelocity.velocity 
                : (note.velocity ?? 100);
              const velocityPercent = (velocity / 127) * 100;
              const isSelected = selectedNotes.has(index);
              
              // 노트가 흑건반인지 확인 (C#, D#, F#, G#, A#)
              const isBlackKey = [1, 3, 6, 8, 10].includes(note.note % 12);
              
              // 빨간색 테마가 활성화되고 선택된 노트면 주황색으로 표시
              let noteColor: string;
              let borderColor: string;
              
              if (isSelected && isRedThemeActive) {
                // 빨간색 테마: 선택된 노트의 벨로시티 바를 주황색으로 표시 (더 부드러운 색상)
                noteColor = '#ffa500'; // 밝은 주황색
                borderColor = '#ff8c00';
              } else {
                // 노트와 동일한 벨로시티 색상 사용
                const defaultColor = getVelocityColor(velocity, isBlackKey);
                const defaultBorder = getVelocityBorderColor(velocity, isBlackKey);
                noteColor = defaultColor;
                borderColor = defaultBorder;
              }
              
              return (
                <div
                  key={`velocity-${index}`}
                  className={`${styles.velocityBarInFooter} ${isSelected ? styles.velocityBarSelected : ''} ${isSelected && isRedThemeActive ? styles.velocityBarSelectedRed : ''}`}
                  style={{
                    position: 'absolute',
                    left: `${noteX}px`,
                    width: `10px`,
                    bottom: '0px',
                    height: `${velocityPercent}%`,
                    maxHeight: '100%',
                    backgroundColor: noteColor,
                    borderLeft: `1px solid ${borderColor}`,
                    cursor: 'ns-resize',
                    pointerEvents: 'auto',
                    boxShadow: isSelected && isRedThemeActive ? '0 0 4px rgba(255, 165, 0, 0.5)' : (isSelected ? '0 0 4px rgba(42, 90, 158, 0.5)' : 'none'),
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setIsAdjustingVelocity?.(true);
                    setAdjustingVelocityNoteIndex?.(index);
                    if (velocityGraphAreaRef.current) {
                      const rect = velocityGraphAreaRef.current.getBoundingClientRect();
                      const startY = e.clientY - rect.top;
                      setVelocityAdjustStartPos?.({
                        y: startY,
                        originalVelocity: velocity,
                      });
                    }
                  }}
                />
              );
            })}
            
            {/* 서스테인 페달 표시 (단일 레인) */}
            {velocityTabSelection === 'sustain' && (() => {
              const currentPixelsPerSecond = pixelsPerSecond || initialPixelsPerSecond;
              const project = getProject();
              const projectTimeSignature = getTimeSignature(project);
              const ppqn = getPpqn(project);
              const tempoMap = project.timing?.tempoMap ?? [];
              return displayedSustainRanges.map((range, index) => {
                const { startTime: startTimeRaw } = ticksToSecondsPure(
                  range.startTick,
                  0,
                  tempoMap,
                  projectTimeSignature,
                  ppqn
                );
                const { startTime: endTimeRaw } = ticksToSecondsPure(
                  range.endTick,
                  0,
                  tempoMap,
                  projectTimeSignature,
                  ppqn
                );
            
                const rangeStart = Math.min(startTimeRaw, endTimeRaw);
                const rangeEnd = Math.max(startTimeRaw, endTimeRaw);
                const startX = rangeStart * currentPixelsPerSecond;
                const width = Math.max(1, (rangeEnd - rangeStart) * currentPixelsPerSecond);
            
                // 해당 range의 startTick에 해당하는 CC64 이벤트의 value 찾기
                let sustainValue = 100; // 기본값
                if (part?.controlChanges) {
                  // 해당 range의 startTick과 가장 가까운 CC64 이벤트 찾기 (ON 상태, value >= 64)
                  const cc64Events = part.controlChanges
                    .filter(cc => cc.controller === 64 && (cc.value ?? 0) >= 64)
                    .sort((a, b) => Math.abs((a.tick ?? 0) - range.startTick) - Math.abs((b.tick ?? 0) - range.startTick));
                  
                  if (cc64Events.length > 0) {
                    const closestEvent = cc64Events[0];
                    // tick이 range.startTick과 매우 가까운 경우만 사용 (10 tick 이내)
                    if (Math.abs((closestEvent.tick ?? 0) - range.startTick) <= 10) {
                      sustainValue = closestEvent.value ?? 100;
                    }
                  }
                }
            
                // value에 따라 높이 계산: 64 = 50%, 127 = 100%
                // 높이 = ((value - 64) / (127 - 64)) * 50% + 50% = ((value - 64) / 63) * 50% + 50%
                const heightPercent = 50 + ((sustainValue - 64) / 63) * 50;
            
                return (
                  <div
                    key={`sustain-range-${index}`}
                    className={`${styles.sustainRange} ${selectedSustainRange.has(index) ? styles.sustainRangeSelected : ''}`}
                    data-sustain-range-index={index}
                    style={{
                      left: `${startX}px`,
                      width: `${width}px`,
                      height: `${heightPercent}%`,
                      bottom: '0px',
                      pointerEvents: 'auto',
                      zIndex: 1,
                      cursor: 'pointer',
                    }}
                  >
                    <div
                      className={`${styles.sustainHandle} ${styles.sustainHandleLeft}`}
                      data-sustain-resize="left"
                      style={{ pointerEvents: 'auto', zIndex: 2 }}
                    />
                    <div
                      className={`${styles.sustainHandle} ${styles.sustainHandleRight}`}
                      data-sustain-resize="right"
                      style={{ pointerEvents: 'auto', zIndex: 2 }}
                    />
                  </div>
                );
              });
            })()}
            {isDrawingSustain && drawingSustain && (() => {
              // 그리드 크기 계산
              const beatUnit = timeSignature[1];
              const noteValueRatio = 4 / beatUnit;
              const secondsPerBeat = (60 / bpm) * noteValueRatio;
              const gridSize = secondsPerBeat;
              
              const rawEndTime = drawingSustain.endTime !== undefined
                ? drawingSustain.endTime
                : drawingSustain.startTime + gridSize;
              const rangeStart = Math.min(drawingSustain.startTime, rawEndTime);
              const rangeEnd = Math.max(drawingSustain.startTime, rawEndTime);
              const currentPixelsPerSecond = pixelsPerSecond || initialPixelsPerSecond;
              const startX = rangeStart * currentPixelsPerSecond;
              // 드래그 중에는 실제 범위를 표시하고, 단순 클릭(같은 위치)일 때만 최소 그리드 크기 사용
              const actualWidth = (rangeEnd - rangeStart) * currentPixelsPerSecond;
              const minWidth = gridSize * currentPixelsPerSecond;
              const width = actualWidth > 0 ? Math.max(minWidth, actualWidth) : minWidth;

              // 미리보기는 기본값 100을 사용하여 높이 계산: 64 = 50%, 127 = 100%
              const previewSustainValue = 100; // 서스테인 페달 생성 시 기본값
              const heightPercent = 50 + ((previewSustainValue - 64) / 63) * 50; // 100일 때 약 78.6%

              return (
                <div
                  key="sustain-preview"
                  className={`${styles.sustainRange} ${styles.sustainRangePreview}`}
                  style={{
                    left: `${startX}px`,
                    width: `${width}px`,
                    height: `${heightPercent}%`,
                    bottom: '0px',
                  }}
                />
              );
            })()}
            {/* 마키 선택 영역 표시 (푸터에서 시작된 경우) */}
            {isSelecting && selectionRect && marqueeSelectionSourceRef?.current === 'footer' && (
              <div
                className={styles.selectionRect}
                style={{
                  left: `${Math.min(selectionRect.startX, selectionRect.endX)}px`,
                  top: `${Math.min(selectionRect.startY, selectionRect.endY)}px`,
                  width: `${Math.abs(selectionRect.endX - selectionRect.startX)}px`,
                  height: `${Math.abs(selectionRect.endY - selectionRect.startY)}px`,
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

EditorFooter.displayName = 'EditorFooter';
