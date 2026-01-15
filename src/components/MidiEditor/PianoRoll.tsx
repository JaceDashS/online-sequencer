import React, { useRef, useState, useEffect, useCallback } from 'react';
import { NoteLayer, type NoteLayerProps, type LanePosition } from './NoteLayer';
import styles from './MidiEditor.module.css';
import { MIDI_EDITOR_CONSTANTS } from '../../constants/ui';
import { ticksToSecondsPure, getTimeSignature, getPpqn } from '../../utils/midiTickUtils';
import { getProject } from '../../store/projectStore';
import { useUIState } from '../../store/uiStore';
import type { MidiPart } from '../../types/project';

/**
 * PianoRoll 컴포넌트 Props
 * Phase 7.4: 피아노 롤 UI 분리
 */
export interface PianoRollProps {
  /** 피아노 키 높이 스케일 */
  pianoKeyHeightScale: number;
  /** 컨텐츠 너비 (픽셀) */
  contentWidth: number;
  /** 드래그 중인지 여부 */
  isDragging: boolean;
  /** 레인 위치 계산 함수 */
  calculateLanePositions: () => LanePosition[];
  /** 호버된 노트 설정 함수 */
  setHoveredNote: (note: number | null) => void;
  /** 피아노 롤 마우스 다운 핸들러 */
  onMouseDown: (e: React.MouseEvent) => void;
  /** 피아노 롤 마우스 무브 핸들러 */
  onMouseMove: (e: React.MouseEvent) => void;
  /** 피아노 롤 마우스 업 핸들러 */
  onMouseUp: (e: React.MouseEvent) => void;
  /** 피아노 롤 더블 클릭 핸들러 */
  onDoubleClick: (e: React.MouseEvent) => void;
  /** 커서 모드 */
  cursorMode: 'splitByKey3Normal' | 'splitByKey3Quantized' | 'splitByAltNormal' | 'splitByAltQuantized' | 'mergeByKey4' | null;
  /** Split 모드 확인 함수 */
  isSplitMode: (mode: 'splitByKey3Normal' | 'splitByKey3Quantized' | 'splitByAltNormal' | 'splitByAltQuantized' | 'mergeByKey4' | null) => boolean;
  /** Split 미리보기 노트 인덱스 */
  splitPreviewNoteIndex: number | null;
  /** NoteLayer에 전달할 props */
  noteLayerProps: Omit<NoteLayerProps, 'lanes'>;
  /** 피아노 롤 ref */
  pianoRollRef?: React.RefObject<HTMLDivElement | null>;
  /** 피아노 롤 컨테이너 ref */
  pianoRollContainerRef: React.RefObject<HTMLDivElement | null>;
  /** 룰러 ref */
  measureRulerRef: React.RefObject<HTMLDivElement | null>;
  velocityGraphAreaRef?: React.RefObject<HTMLDivElement | null>;
  /** momentum scrolling 차단 관련 refs */
  lastProgrammaticScrollLeftRef: React.MutableRefObject<number | null>;
  momentumBlockTimeoutRef: React.MutableRefObject<number | null>;
  momentumBlockRafRef: React.MutableRefObject<number | null>;
  /** 파트 정보 */
  part: MidiPart | null;
  /** 파트 duration (초) */
  partDuration: number;
  /** BPM */
  bpm: number;
  /** 타임 시그니처 */
  timeSignature: [number, number];
  /** 픽셀/초 */
  pixelsPerSecond: number | null;
  /** 초기 픽셀/초 */
  initialPixelsPerSecond: number;
  /** 현재 재생 시간 */
  currentPlaybackTime: number;
  /** Marquee 선택 중인지 여부 */
  isSelecting: boolean;
  /** Marquee 선택 영역 */
  selectionRect: { startX: number; startY: number; endX: number; endY: number } | null;
  /** Marquee 선택이 시작된 소스 (피아노롤에서 시작된 경우에만 영역 표시) */
  marqueeSelectionSourceRef?: React.MutableRefObject<'pianoRoll' | 'footer' | null>;
  /** 픽셀/초 변경 함수 */
  onPixelsPerSecondChange?: (value: number) => void;
  /** 최소 줌 */
  minZoom?: number;
  /** 최대 줌 */
  maxZoom?: number;
}

/**
 * PianoRoll 컴포넌트
 * Phase 7.4: MidiEditor의 피아노 롤 UI를 담당하는 컴포넌트
 * 
 * 피아노 키 영역과 노트 레인 영역을 포함합니다.
 */
export const PianoRoll: React.FC<PianoRollProps> = ({
  pianoKeyHeightScale,
  contentWidth,
  calculateLanePositions,
  setHoveredNote,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onDoubleClick,
  cursorMode,
  isSplitMode,
  splitPreviewNoteIndex,
  isDragging,
  noteLayerProps,
  pianoRollRef: externalPianoRollRef,
  pianoRollContainerRef,
  measureRulerRef,
  velocityGraphAreaRef,
  lastProgrammaticScrollLeftRef,
  momentumBlockTimeoutRef,
  momentumBlockRafRef,
  part,
  partDuration,
  bpm,
  timeSignature,
  pixelsPerSecond,
  initialPixelsPerSecond,
  currentPlaybackTime,
  isSelecting,
  selectionRect,
  marqueeSelectionSourceRef,
  onPixelsPerSecondChange,
  minZoom,
  maxZoom,
}) => {
  // 내부 ref 사용 (외부 ref가 제공되지 않은 경우)
  const internalPianoRollRef = useRef<HTMLDivElement>(null);
  const ui = useUIState();
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  
  const pianoRollRef = externalPianoRollRef || internalPianoRollRef;

  // 레인 위치 계산
  const lanes = calculateLanePositions();

  // Step 7.4: 피아노 롤 컨테이너를 PianoRoll 컴포넌트로 교체
  // pianoRollContainerRef div와 그 내부를 모두 반환

  const getPlaybackTimeFromRoll = useCallback((clientX: number): number | null => {
    if (!pianoRollRef.current || !part) return null;
    const rect = pianoRollRef.current.getBoundingClientRect();
    const scrollLeft = pianoRollContainerRef.current?.scrollLeft ?? 0;
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
  }, [pianoRollRef, pianoRollContainerRef, part, pixelsPerSecond, initialPixelsPerSecond]);

  useEffect(() => {
    if (!isDraggingPlayhead) return;

    const handleMouseMove = (e: MouseEvent) => {
      const time = getPlaybackTimeFromRoll(e.clientX);
      if (time === null) return;
      ui.setCurrentPlaybackTime(time);
    };

    const handleMouseUp = () => {
      setIsDraggingPlayhead(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [getPlaybackTimeFromRoll, isDraggingPlayhead, ui]);

  return (
    <div 
      ref={pianoRollContainerRef}
      className={styles.pianoRollContainer}
      style={{
        height: '100%',
        position: 'relative',
      }}
      onWheel={(e) => {
        // 룰러 영역에서 발생한 이벤트인지 확인
        const target = e.target as HTMLElement;
        const rulerContainer = measureRulerRef.current;
        if (rulerContainer && (rulerContainer.contains(target) || rulerContainer === target)) {
          // 룰러 영역에서 발생한 이벤트는 무시
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        
        // Alt 키가 눌려있으면 줌 제어
        if (e.altKey && onPixelsPerSecondChange) {
          e.preventDefault();
          e.stopPropagation();
          
          const currentZoom = pixelsPerSecond ?? initialPixelsPerSecond;
          const zoomDelta = -e.deltaY * 0.01; // 스크롤 방향에 따라 줌 변경 (위로 스크롤 = 줌 인, 아래로 스크롤 = 줌 아웃)
          const newZoom = Math.max(
            minZoom ?? MIDI_EDITOR_CONSTANTS.MIN_ZOOM,
            Math.min(
              maxZoom ?? MIDI_EDITOR_CONSTANTS.MAX_ZOOM,
              currentZoom * (1 + zoomDelta)
            )
          );
          
          if (newZoom !== currentZoom) {
            onPixelsPerSecondChange(newZoom);
          }
          return;
        }
        
        // Alt 키가 눌려있지 않으면 기존 스크롤 동작
        // X축 스크롤(또는 Shift+Y축)만 프로그래밍 방식으로 처리
        // Y축 스크롤은 브라우저 기본 동작으로 처리 (preventDefault 호출 안 함)
        const delta = e.deltaX !== 0 ? e.deltaX : (e.shiftKey ? e.deltaY : 0);
        // Y축만 스크롤하는 경우 (deltaX가 0이고 shiftKey가 false) 브라우저 기본 동작 허용
        if (delta === 0) {
          // Y축 스크롤을 방해하지 않기 위해 아무것도 하지 않고 return
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        
        const container = pianoRollContainerRef.current;
        if (!container) return;
        
        const scrollLeftBefore = container.scrollLeft;
        const maxScrollLeft = container.scrollWidth - container.clientWidth;
        const nextScrollLeft = Math.max(0, Math.min(scrollLeftBefore + delta, maxScrollLeft));
        // momentum scrolling 완전 차단: scrollLeft 설정 직전에 overflow를 일시적으로 hidden으로 설정
        const originalOverflow = container.style.overflow;
        container.style.overflow = 'hidden';
        container.scrollLeft = nextScrollLeft;
        if (measureRulerRef.current) {
          measureRulerRef.current.scrollLeft = nextScrollLeft;
        }
        if (velocityGraphAreaRef?.current) {
          velocityGraphAreaRef.current.scrollLeft = nextScrollLeft;
        }
        
        // momentum scrolling 차단을 위해 설정한 값 추적
        lastProgrammaticScrollLeftRef.current = nextScrollLeft;
        
        // momentum scrolling 완전 차단을 위해 requestAnimationFrame을 여러 번 실행하고 일정 시간 후 추적 해제
        if (momentumBlockTimeoutRef.current !== null) {
          clearTimeout(momentumBlockTimeoutRef.current);
        }
        if (momentumBlockRafRef.current !== null) {
          cancelAnimationFrame(momentumBlockRafRef.current);
        }
        
        // requestAnimationFrame을 재귀적으로 실행하여 지속적으로 momentum scrolling 차단
        // momentum scrolling이 완전히 멈출 때까지 계속 확인
        let stableCount = 0; // 연속으로 안정된 횟수
        const checkAndBlockMomentum = () => {
          const container = pianoRollContainerRef.current;
          const lastProgrammatic = lastProgrammaticScrollLeftRef.current;
          if (container && lastProgrammatic !== null) {
            const diff = Math.abs(container.scrollLeft - lastProgrammatic);
            if (diff > 0.5) {
              container.scrollLeft = lastProgrammatic;
              stableCount = 0; // momentum scrolling 감지 시 안정 카운트 리셋
              // 계속 확인
              momentumBlockRafRef.current = requestAnimationFrame(checkAndBlockMomentum);
            } else {
              // 값이 정확하면 안정 카운트 증가
              stableCount++;
              if (stableCount < 3) {
                // 연속으로 3프레임 이상 안정되면 overflow 복원 및 추적 해제
                momentumBlockRafRef.current = requestAnimationFrame(checkAndBlockMomentum);
              } else {
                // momentum scrolling이 완전히 멈춤
                container.style.overflow = originalOverflow || 'auto';
                // 일정 시간(200ms) 후 추적 해제 (안전하게)
                momentumBlockTimeoutRef.current = window.setTimeout(() => {
                  lastProgrammaticScrollLeftRef.current = null;
                  momentumBlockTimeoutRef.current = null;
                  momentumBlockRafRef.current = null;
                }, 200);
              }
            }
          } else {
            // 추적이 해제되었으면 overflow 복원
            if (container) {
              container.style.overflow = originalOverflow || 'auto';
            }
          }
        };
        
        // 즉시 한 번 확인 (overflow는 아직 hidden 상태)
        momentumBlockRafRef.current = requestAnimationFrame(checkAndBlockMomentum);
      }}
    >
      {/* 로케이터 범위 표시 (Export Range) - 전체 레인 높이에 표시 */}
      {part && (() => {
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
        const currentPixelsPerSecond = pixelsPerSecond ?? initialPixelsPerSecond;
        
        // 컨테이너의 높이를 기준으로 전체 레인 높이 계산
        // pianoRoll div의 높이는 pianoKeyHeightScale * 100%이므로, 
        // 컨테이너 높이에 pianoKeyHeightScale을 곱하면 전체 레인 높이가 됨
        const containerHeight = pianoRollContainerRef.current?.clientHeight ?? 0;
        const fullLaneHeight = containerHeight * pianoKeyHeightScale;
        
        return (
          <>
            {/* 두 로케이터가 모두 있는 경우 */}
            {ui.exportRangeStart !== null && ui.exportRangeEnd !== null && (() => {
              const rangeStartX = (ui.exportRangeStart - partStartTime) * currentPixelsPerSecond;
              const rangeEndX = (ui.exportRangeEnd - partStartTime) * currentPixelsPerSecond;
              const rangeLeft = Math.min(rangeStartX, rangeEndX);
              const rangeWidth = Math.abs(rangeEndX - rangeStartX);
              
              // 범위가 보이는 영역에 있는지 확인
              if (rangeLeft >= -contentWidth && rangeLeft <= contentWidth) {
                return (
                  <>
                    {/* Export Range Overlay */}
                    <div
                      className={styles.exportRangeOverlay}
                      style={{
                        position: 'absolute',
                        left: `${rangeLeft}px`,
                        width: `${rangeWidth}px`,
                        top: '0px',
                        height: `${fullLaneHeight}px`,
                        backgroundColor: 'rgba(0, 0, 0, 0.3)',
                        pointerEvents: 'none',
                        zIndex: 1,
                      }}
                    />
                    {/* Left Locator Line */}
                    <div
                      className={styles.leftLocatorLine}
                      style={{
                        position: 'absolute',
                        left: `${rangeStartX}px`,
                        top: '0px',
                        height: `${fullLaneHeight}px`,
                        width: '2px',
                        backgroundColor: '#4a9eff',
                        pointerEvents: 'none',
                        zIndex: 2,
                      }}
                    />
                    {/* Right Locator Line */}
                    <div
                      className={styles.rightLocatorLine}
                      style={{
                        position: 'absolute',
                        left: `${rangeEndX}px`,
                        top: '0px',
                        height: `${fullLaneHeight}px`,
                        width: '2px',
                        backgroundColor: '#4a9eff',
                        pointerEvents: 'none',
                        zIndex: 2,
                      }}
                    />
                  </>
                );
              }
              return null;
            })()}
            {/* Left Locator만 있는 경우 */}
            {ui.exportRangeStart !== null && ui.exportRangeEnd === null && (() => {
              const rangeStartX = (ui.exportRangeStart - partStartTime) * currentPixelsPerSecond;
              if (rangeStartX >= -contentWidth && rangeStartX <= contentWidth) {
                return (
                  <div
                    className={styles.leftLocatorLine}
                    style={{
                      position: 'absolute',
                      left: `${rangeStartX}px`,
                      top: '0px',
                      height: `${fullLaneHeight}px`,
                      width: '2px',
                      backgroundColor: '#4a9eff',
                      pointerEvents: 'none',
                      zIndex: 2,
                    }}
                  />
                );
              }
              return null;
            })()}
            {/* Right Locator만 있는 경우 */}
            {ui.exportRangeStart === null && ui.exportRangeEnd !== null && (() => {
              const rangeEndX = (ui.exportRangeEnd - partStartTime) * currentPixelsPerSecond;
              if (rangeEndX >= -contentWidth && rangeEndX <= contentWidth) {
                return (
                  <div
                    className={styles.rightLocatorLine}
                    style={{
                      position: 'absolute',
                      left: `${rangeEndX}px`,
                      top: '0px',
                      height: `${fullLaneHeight}px`,
                      width: '2px',
                      backgroundColor: '#4a9eff',
                      pointerEvents: 'none',
                      zIndex: 2,
                    }}
                  />
                );
              }
              return null;
            })()}
          </>
        );
      })()}
      {/* 피아노 롤 div */}
      <div
        ref={pianoRollRef}
        className={styles.pianoRoll}
        style={{
          width: `${contentWidth + 1}px`,
          height: `${pianoKeyHeightScale * 100}%`,
          cursor: (cursorMode === 'mergeByKey4' ? 'inherit' : (isSplitMode(cursorMode) && splitPreviewNoteIndex !== null) ? 'none' : (isDragging ? 'grabbing' : 'default')),
        }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onDoubleClick={onDoubleClick}
      >
        {/* 미디 노트 레인 (12등분: 반음 단위, 흑건반 스케일 적용) */}
        {lanes.map((lane) => {
          // MIDI 노트 번호 계산 (lane.index는 이미 실제 MIDI 노트 번호 0-127)
          const midiNote = lane.index;
          
          return (
            <div
              key={`semitone-${lane.index}`}
              className={styles.noteLane}
              data-black-key={lane.isBlackKey}
              style={{
                top: `${lane.top}%`,
                height: `${lane.height}%`,
              }}
              onMouseEnter={() => {
                setHoveredNote(midiNote);
              }}
              onMouseLeave={() => {
                setHoveredNote(null);
              }}
            />
          );
        })}
        
        {/* NoteLayer 컴포넌트 (노트 렌더링) */}
        <NoteLayer
          {...noteLayerProps}
          lanes={lanes}
        />

        {/* Playhead overlay (full lane height) */}
        {part && (() => {
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
          const currentPixelsPerSecond = pixelsPerSecond ?? initialPixelsPerSecond;
          
          return (
            <div
              className={`${styles.playhead} ${ui.isRecording ? styles.playheadRecording : ''}`}
              style={{
                left: `${(currentPlaybackTime - partStartTime) * currentPixelsPerSecond}px`,
                top: '0px',
                pointerEvents: 'auto',
                cursor: 'ew-resize',
              }}
              onMouseDown={(e) => {
                if (e.button !== 0) return;
                const time = getPlaybackTimeFromRoll(e.clientX);
                if (time === null) return;
                ui.setCurrentPlaybackTime(time);
                setIsDraggingPlayhead(true);
                e.preventDefault();
                e.stopPropagation();
              }}
            />
          );
        })()}
      </div>

      {/* 그리드 표시 (글로벌 BPM과 timeSignature 기준) */}
      {(() => {
        if (!part) return [];
        
        // 글로벌 기준으로 그리드 계산
        const beatsPerMeasure = timeSignature[0];
        const beatUnit = timeSignature[1];
        const noteValueRatio = 4 / beatUnit;
        const secondsPerBeat = (60 / bpm) * noteValueRatio;
        const gridSize = secondsPerBeat; // 1박자 단위 (4/4의 경우 4분음표 단위)
        const secondsPerMeasure = beatsPerMeasure * secondsPerBeat;
        
        // 파트의 startTime 계산 (tick 기반, SMF 표준 정합)
        const project = getProject();
        const projectTimeSignature = getTimeSignature(project);
        const ppqn = getPpqn(project);
        const tempoMap = project.timing?.tempoMap ?? [];
        const gridLines = [];
        const { startTime: partStartTime } = ticksToSecondsPure(
          part.startTick,
          part.durationTicks,
          tempoMap,
          projectTimeSignature,
          ppqn
        );
        
        // 클립의 시작 시간을 고려하여 그리드 생성
        const startGridIndex = Math.floor(partStartTime / gridSize);
        const endGridIndex = Math.ceil((partStartTime + partDuration) / gridSize);
        
        for (let i = startGridIndex; i <= endGridIndex; i++) {
          const gridTime = i * gridSize;
          // 클립 내부의 상대 시간으로 변환
          const relativeTime = gridTime - partStartTime;
          if (relativeTime >= 0 && relativeTime <= partDuration) {
            const currentPixelsPerSecond = pixelsPerSecond || initialPixelsPerSecond;
            const x = relativeTime * currentPixelsPerSecond;
            // 마디 경계인지 확인 (글로벌 시간 기준)
            // gridTime이 마디의 시작인지 확인 (글로벌 시간 기준)
            const timeInMeasure = gridTime % secondsPerMeasure;
            const isMeasureBoundary = Math.abs(timeInMeasure) < MIDI_EDITOR_CONSTANTS.FLOAT_EPSILON;
            
            gridLines.push(
              <div
                key={`grid-${i}`}
                className={`${styles.gridLine} ${isMeasureBoundary ? styles.gridLineStrong : ''}`}
                style={{ 
                  left: `${x}px`,
                  top: `0px`,
                  height: `${pianoKeyHeightScale * 100}%`,
                }}
              />
            );
          }
        }
        
        return gridLines;
      })()}
      
      {/* Marquee 선택 영역 표시 (피아노롤에서 시작된 경우에만) */}
      {isSelecting && selectionRect && marqueeSelectionSourceRef?.current !== 'footer' && (
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
  );
};
