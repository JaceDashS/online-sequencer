import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import styles from './MeasureRuler.module.css';
import { useUIState } from '../../store/uiStore';
import { subscribeToProjectChanges, getProject, setExportRangeMeasure, getExportRangeMeasure, timeToMeasure, measureToTime } from '../../store/projectStore';
import { secondsToTicksPure, ticksToSecondsPure, getPpqn, getBpm, getTimeSignature } from '../../utils/midiTickUtils';
import { subscribePlaybackTime } from '../../utils/playbackTimeStore';
import { calculateTotalWidth } from './EventDisplayCalculations';

interface MeasureRulerProps {
  bpm: number;
  timeSignature: [number, number]; // [beatsPerMeasure, beatUnit]
  pixelsPerSecond?: number; // 초당 픽셀 수 (줌 레벨)
  startTime?: number; // 시작 시간 (초)
  isRecording?: boolean; // 녹음 중 여부
  disableInteraction?: boolean; // 로케이터 조작 비활성화 (에디터에서 사용)
  extendPlayhead?: boolean;
  playheadExtendPx?: number;
}

const MeasureRuler: React.FC<MeasureRulerProps> = ({
  bpm = 120,
  timeSignature = [4, 4],
  pixelsPerSecond = 50,
  startTime = 0,
  isRecording = false,
  disableInteraction = false,
  extendPlayhead = false,
  playheadExtendPx = 1200,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rulerContentRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const ui = useUIState();
  const isQuantizeEnabledRef = useRef(ui.isQuantizeEnabled);
  
  // isQuantizeEnabled 변경 시 ref 업데이트
  useEffect(() => {
    isQuantizeEnabledRef.current = ui.isQuantizeEnabled;
  }, [ui.isQuantizeEnabled]);
  
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const [isDraggingRange, setIsDraggingRange] = useState(false);
  const [rangeDragStart, setRangeDragStart] = useState<number | null>(null);
  const [isDraggingLeftLocator, setIsDraggingLeftLocator] = useState(false);
  const [isDraggingRightLocator, setIsDraggingRightLocator] = useState(false);

  // 150마디의 총 너비 계산 (메모이제이션)
  // 박자 변경 시에도 확대/축소가 되지 않도록 timeSignature에 관계없이 고정된 시간 범위 사용
  // 4/4 박자 기준으로 150마디를 고정 너비로 사용
  const baseBeatsPerMeasure = 4; // 고정된 기준 박자 (4/4)
  const baseBeatUnit = 4;
  const baseNoteValueRatio = 4 / baseBeatUnit;
  const baseSecondsPerBeat = (60 / bpm) * baseNoteValueRatio;
  const baseSecondsPerMeasure = baseBeatsPerMeasure * baseSecondsPerBeat;
  const totalWidth = useMemo(() => {
    return calculateTotalWidth(bpm, pixelsPerSecond);
  }, [bpm, pixelsPerSecond]);
  
  // 마디 마커 위치 계산에는 실제 박자 사용
  const beatsPerMeasure = timeSignature[0];
  const beatUnit = timeSignature[1];
  const noteValueRatio = 4 / beatUnit;
  const secondsPerBeat = (60 / bpm) * noteValueRatio;
  const secondsPerMeasure = beatsPerMeasure * secondsPerBeat;

  // 로케이터를 마디 기반으로 저장하는 헬퍼 함수
  const saveExportRangeToMeasure = useCallback((startTime: number | null, endTime: number | null) => {
    if (startTime !== null && endTime !== null) {
      const { measureStart: measureStart } = timeToMeasure(startTime, 0, bpm, timeSignature);
      const { measureStart: measureEnd } = timeToMeasure(endTime, 0, bpm, timeSignature);
      setExportRangeMeasure(measureStart, measureEnd);
    } else if (startTime !== null) {
      const { measureStart: measureStart } = timeToMeasure(startTime, 0, bpm, timeSignature);
      setExportRangeMeasure(measureStart, null);
    } else if (endTime !== null) {
      const { measureStart: measureEnd } = timeToMeasure(endTime, 0, bpm, timeSignature);
      setExportRangeMeasure(null, measureEnd);
    } else {
      setExportRangeMeasure(null, null);
    }
  }, [bpm, timeSignature]);

  // 기본 Export 범위 설정 (measure 2에서 10)
  useEffect(() => {
    if (ui.exportRangeStart === null && ui.exportRangeEnd === null) {
      const measure2Time = 1 * baseSecondsPerMeasure; // measure 2 (1-based to 0-based)
      const measure10Time = 9 * baseSecondsPerMeasure; // measure 10 (1-based to 0-based)
      ui.setExportRange(measure2Time, measure10Time);
      saveExportRangeToMeasure(measure2Time, measure10Time);
    }
  }, [baseSecondsPerMeasure, ui, saveExportRangeToMeasure]);

  // 박자 변경 시 로케이터 재계산
  useEffect(() => {
    const unsubscribe = subscribeToProjectChanges((event) => {
      if (event.type === 'timeSignature') {
        const { measureStart, measureEnd } = getExportRangeMeasure();
        const project = getProject();
        if (measureStart !== null) {
          const { startTime } = measureToTime(measureStart, 0, getBpm(project), getTimeSignature(project));
          ui.setExportRangeStart(startTime);
        }
        if (measureEnd !== null) {
          const { startTime } = measureToTime(measureEnd, 0, getBpm(project), getTimeSignature(project));
          ui.setExportRangeEnd(startTime);
        }
      }
    });
    return unsubscribe;
  }, [ui, bpm, timeSignature]);

  // 하단 스크롤바와 동기화
  useEffect(() => {
    if (!rulerContentRef.current) return;

    const rulerContent = rulerContentRef.current;
    const rulerContainer = containerRef.current;
    const bottomScrollbar = document.getElementById('timeline-scrollbar');
    
    if (!rulerContent || !bottomScrollbar) return;

    // 하단 스크롤바의 너비를 룰러 콘텐츠와 동일하게 설정
    const updateScrollbarWidth = () => {
      const scrollbarContent = bottomScrollbar.firstElementChild;
      if (scrollbarContent && scrollbarContent instanceof HTMLElement) {
        scrollbarContent.style.width = `${totalWidth}px`;
      }
    };

    updateScrollbarWidth();

    // 스크롤 동기화: 하단 스크롤바를 움직이면 룰러도 움직임
    // EventDisplay와 동일하게 container.scrollLeft도 업데이트해야 함
    let isUpdating = false;
    const handleScroll = (e: Event) => {
      if (isUpdating) return;
      if (!(e.target instanceof HTMLElement)) return;
      const target = e.target;
      if (target === bottomScrollbar) {
        isUpdating = true;
        const scrollLeft = target.scrollLeft;
        rulerContent.style.transform = `translateX(-${scrollLeft}px)`;
        // EventDisplay와 동일하게 container.scrollLeft도 업데이트
        if (rulerContainer) {
          rulerContainer.scrollLeft = scrollLeft;
        }
        requestAnimationFrame(() => {
          isUpdating = false;
        });
      }
    };

    // 스크롤바 스타일 주입
    const styleId = 'timeline-scrollbar-style';
    let styleElement = document.getElementById(styleId);
    
    if (!styleElement || !(styleElement instanceof HTMLStyleElement)) {
      styleElement = document.createElement('style');
      styleElement.id = styleId;
      document.head.appendChild(styleElement);
    }

    styleElement.textContent = `
      #timeline-scrollbar {
        -webkit-overflow-scrolling: auto !important;
        scrollbar-width: thin !important;
        scrollbar-color: #5a5a5a #2a2a2a !important;
      }
      #timeline-scrollbar::-webkit-scrollbar {
        height: 8px !important;
        display: block !important;
        -webkit-appearance: none !important;
      }
      #timeline-scrollbar::-webkit-scrollbar-track {
        background: #2a2a2a !important;
      }
      #timeline-scrollbar::-webkit-scrollbar-thumb {
        background: #5a5a5a !important;
        border-radius: 4px !important;
      }
      #timeline-scrollbar::-webkit-scrollbar-thumb:hover {
        background: #6a6a6a !important;
      }
      @media (max-width: 768px) {
        #timeline-scrollbar::-webkit-scrollbar {
          height: 8px !important;
          display: block !important;
        }
      }
    `;

    bottomScrollbar.addEventListener('scroll', handleScroll);
    window.addEventListener('resize', updateScrollbarWidth);

    // MeasureRuler container의 스크롤 이벤트 처리 (EventDisplay와 동기화)
    const handleRulerContainerScroll = () => {
      if (isUpdating) return;
      if (!rulerContainer) return;
      isUpdating = true;
      const scrollLeft = rulerContainer.scrollLeft;
      bottomScrollbar.scrollLeft = scrollLeft;
      requestAnimationFrame(() => {
        isUpdating = false;
      });
    };

    if (rulerContainer) {
      rulerContainer.addEventListener('scroll', handleRulerContainerScroll, { passive: true });
    }

    return () => {
      bottomScrollbar.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', updateScrollbarWidth);
      if (rulerContainer) {
        rulerContainer.removeEventListener('scroll', handleRulerContainerScroll);
      }
      const element = document.getElementById(styleId);
      if (element) {
        element.remove();
      }
    };
  }, [totalWidth]);

  // 플레이 헤드 드래그 처리
  useEffect(() => {
    if (!isDraggingPlayhead) return;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!rulerContentRef.current) return;
      const rect = rulerContentRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const newTime = Math.max(0, (x / pixelsPerSecond) + startTime);
      ui.setCurrentPlaybackTime(newTime);
    };

    const handleGlobalMouseUp = () => {
      setIsDraggingPlayhead(false);
    };

    document.addEventListener('mousemove', handleGlobalMouseMove);
    document.addEventListener('mouseup', handleGlobalMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isDraggingPlayhead, pixelsPerSecond, startTime, ui, disableInteraction]);

  // 범위 드래그 처리 (Ctrl+드래그)
  useEffect(() => {
    if (!isDraggingRange || rangeDragStart === null) return;
    // 에디터가 열려있거나 상호작용이 비활성화된 경우 드래그 중단
    if (disableInteraction || ui.editingPartId !== null) {
      setIsDraggingRange(false);
      setRangeDragStart(null);
      return;
    }

    // rect를 드래그 시작 시 한 번만 계산하여 캐시
    let cachedRectLeft: number | null = null;
    if (rulerContentRef.current) {
      const rect = rulerContentRef.current.getBoundingClientRect();
      cachedRectLeft = rect.left;
    }

    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!rulerContentRef.current || disableInteraction || ui.editingPartId !== null) {
        setIsDraggingRange(false);
        setRangeDragStart(null);
        return;
      }
      
      // 캐시된 rect.left 사용 (드래그 중에는 위치가 변하지 않으므로)
      const x = cachedRectLeft !== null ? e.clientX - cachedRectLeft : 0;
      let newTime = Math.max(0, (x / pixelsPerSecond) + startTime);
      
      // Tick 기반 퀀타이즈 적용 (SMF 표준 정합)
      if (isQuantizeEnabledRef.current) {
        const project = getProject();
        const projectTimeSignature = getTimeSignature(project);
        const ppqn = getPpqn(project);
        const tempoMap = project.timing?.tempoMap ?? [];
        // 시간을 Tick으로 변환
        const { startTick: newTimeTick } = secondsToTicksPure(
          newTime,
          0,
          tempoMap,
          projectTimeSignature,
          ppqn
        );
        
        // Tick 기반 퀀타이즈 (1 beat = PPQN ticks) - 프로젝트의 실제 PPQN 사용
        const ticksPerBeat = ppqn;
        const snappedTimeTick = Math.round(newTimeTick / ticksPerBeat) * ticksPerBeat;
        
        // Tick을 다시 초로 변환
        const { startTime: snappedTime } = ticksToSecondsPure(
          snappedTimeTick,
          0,
          tempoMap,
          projectTimeSignature,
          ppqn
        );
        newTime = Math.max(0, snappedTime);
      }
      
      // 드래그 방향에 따라 시작점/끝점 설정
      if (newTime >= rangeDragStart) {
        ui.setExportRange(rangeDragStart, newTime);
        saveExportRangeToMeasure(rangeDragStart, newTime);
      } else {
        ui.setExportRange(newTime, rangeDragStart);
        saveExportRangeToMeasure(newTime, rangeDragStart);
      }
    };

    const handleGlobalMouseUp = () => {
      setIsDraggingRange(false);
      setRangeDragStart(null);
    };

    document.addEventListener('mousemove', handleGlobalMouseMove);
    document.addEventListener('mouseup', handleGlobalMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isDraggingRange, rangeDragStart, pixelsPerSecond, startTime, ui, bpm, timeSignature, saveExportRangeToMeasure]);

  // Left Locator 드래그 처리
  useEffect(() => {
    if (!isDraggingLeftLocator) return;
    // 에디터가 열려있거나 상호작용이 비활성화된 경우 드래그 중단
    if (disableInteraction || ui.editingPartId !== null) {
      setIsDraggingLeftLocator(false);
      return;
    }

    // rect를 드래그 시작 시 한 번만 계산하여 캐시
    let cachedRectLeft: number | null = null;
    if (rulerContentRef.current) {
      const rect = rulerContentRef.current.getBoundingClientRect();
      cachedRectLeft = rect.left;
    }

    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!rulerContentRef.current || disableInteraction || ui.editingPartId !== null) {
        setIsDraggingLeftLocator(false);
        return;
      }
      
      // 캐시된 rect.left 사용 (드래그 중에는 위치가 변하지 않으므로)
      const x = cachedRectLeft !== null ? e.clientX - cachedRectLeft : 0;
      let newTime = Math.max(0, (x / pixelsPerSecond) + startTime);
      
      // Tick 기반 퀀타이즈 적용 (SMF 표준 정합)
      if (isQuantizeEnabledRef.current) {
        const project = getProject();
        const projectTimeSignature = getTimeSignature(project);
        const ppqn = getPpqn(project);
        const tempoMap = project.timing?.tempoMap ?? [];
        // 시간을 Tick으로 변환
        const { startTick: newTimeTick } = secondsToTicksPure(
          newTime,
          0,
          tempoMap,
          projectTimeSignature,
          ppqn
        );
        
        // Tick 기반 퀀타이즈 (1 beat = PPQN ticks) - 프로젝트의 실제 PPQN 사용
        const ticksPerBeat = ppqn;
        const snappedTimeTick = Math.round(newTimeTick / ticksPerBeat) * ticksPerBeat;
        
        // Tick을 다시 초로 변환
        const { startTime: snappedTime } = ticksToSecondsPure(
          snappedTimeTick,
          0,
          tempoMap,
          projectTimeSignature,
          ppqn
        );
        newTime = Math.max(0, snappedTime);
      }
      
      ui.setExportRangeStart(newTime);
      saveExportRangeToMeasure(newTime, ui.exportRangeEnd);
    };

    const handleGlobalMouseUp = () => {
      setIsDraggingLeftLocator(false);
    };

    document.addEventListener('mousemove', handleGlobalMouseMove);
    document.addEventListener('mouseup', handleGlobalMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isDraggingLeftLocator, pixelsPerSecond, startTime, ui, bpm, timeSignature, saveExportRangeToMeasure, disableInteraction]);

  // Right Locator 드래그 처리
  useEffect(() => {
    if (!isDraggingRightLocator) return;
    // 에디터가 열려있거나 상호작용이 비활성화된 경우 드래그 중단
    if (disableInteraction || ui.editingPartId !== null) {
      setIsDraggingRightLocator(false);
      return;
    }

    // rect를 드래그 시작 시 한 번만 계산하여 캐시
    let cachedRectLeft: number | null = null;
    if (rulerContentRef.current) {
      const rect = rulerContentRef.current.getBoundingClientRect();
      cachedRectLeft = rect.left;
    }

    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!rulerContentRef.current || disableInteraction || ui.editingPartId !== null) {
        setIsDraggingRightLocator(false);
        return;
      }
      
      // 캐시된 rect.left 사용 (드래그 중에는 위치가 변하지 않으므로)
      const x = cachedRectLeft !== null ? e.clientX - cachedRectLeft : 0;
      let newTime = Math.max(0, (x / pixelsPerSecond) + startTime);
      
      // Tick 기반 퀀타이즈 적용 (SMF 표준 정합)
      if (isQuantizeEnabledRef.current) {
        const project = getProject();
        const projectTimeSignature = getTimeSignature(project);
        const ppqn = getPpqn(project);
        const tempoMap = project.timing?.tempoMap ?? [];
        // 시간을 Tick으로 변환
        const { startTick: newTimeTick } = secondsToTicksPure(
          newTime,
          0,
          tempoMap,
          projectTimeSignature,
          ppqn
        );
        
        // Tick 기반 퀀타이즈 (1 beat = PPQN ticks) - 프로젝트의 실제 PPQN 사용
        const ticksPerBeat = ppqn;
        const snappedTimeTick = Math.round(newTimeTick / ticksPerBeat) * ticksPerBeat;
        
        // Tick을 다시 초로 변환
        const { startTime: snappedTime } = ticksToSecondsPure(
          snappedTimeTick,
          0,
          tempoMap,
          projectTimeSignature,
          ppqn
        );
        newTime = Math.max(0, snappedTime);
      }
      
      ui.setExportRangeEnd(newTime);
      saveExportRangeToMeasure(ui.exportRangeStart, newTime);
    };

    const handleGlobalMouseUp = () => {
      setIsDraggingRightLocator(false);
    };

    document.addEventListener('mousemove', handleGlobalMouseMove);
    document.addEventListener('mouseup', handleGlobalMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isDraggingRightLocator, pixelsPerSecond, startTime, ui, bpm, timeSignature, saveExportRangeToMeasure, disableInteraction]);

  // 통합 마커 생성 (마디 마커와 박자 마커를 하나의 배열로)
  // 마커 타입: 'strong' (마디 시작), 'medium' (중간 강도), 'weak' (약한 박자)
  type MarkerType = 'strong' | 'medium' | 'weak';
  interface UnifiedMarker {
    type: MarkerType;
    measure: number;
    beat?: number;
    x: number;
    time: number;
    markerIndex: number;
  }
  
  const allMarkers = useMemo<UnifiedMarker[]>(() => {
    const markers: UnifiedMarker[] = [];
    
    for (let measureIndex = 0; measureIndex < 300; measureIndex++) {
      const measureStartTime = measureIndex * secondsPerMeasure;
      const measureNumber = measureIndex + 1;
      
      // 각 마디 내의 모든 박자 마커 생성 (마디 시작 포함)
      for (let beatIndex = 0; beatIndex < beatsPerMeasure; beatIndex++) {
        const beatTime = measureStartTime + beatIndex * secondsPerBeat;
        const xPosition = (beatTime - startTime) * pixelsPerSecond;
        
        // 전체 마커 순서 계산 (마디 시작을 포함)
        // 마디 시작 = 0, 첫 박자 = 1, 둘째 박자 = 2, ...
        const markerIndex = measureIndex * beatsPerMeasure + beatIndex;
        
        // 마커 타입 결정: 강약약약중약약약중약...강 패턴
        // 마디 시작(beatIndex === 0) = 강한 마커
        // 4박자마다(beatIndex % 4 === 0 && beatIndex !== 0) = 중간 마커
        // 나머지 = 약한 마커
        let markerType: MarkerType = 'weak';
        if (beatIndex === 0) {
          // 마디 시작 = 강한 마커
          markerType = 'strong';
        } else if (beatIndex % 4 === 0) {
          // 4박자마다 중간 마커 (마디 시작 제외)
          markerType = 'medium';
        }
        
        markers.push({
          type: markerType,
          measure: measureNumber,
          beat: beatIndex,
          x: xPosition,
          time: beatTime,
          markerIndex: markerIndex,
        });
      }
    }
    
    // 시간 순서로 정렬 (같은 위치의 마커는 강한 마커가 먼저)
    markers.sort((a, b) => {
      if (Math.abs(a.time - b.time) < 0.001) {
        // 같은 위치면 강한 마커가 먼저
        const typeOrder = { strong: 0, medium: 1, weak: 2 };
        return typeOrder[a.type] - typeOrder[b.type];
      }
      return a.time - b.time;
    });
    
    return markers;
  }, [bpm, timeSignature, pixelsPerSecond, startTime]);

  // 초 마커 생성 (10초마다, 메모이제이션)
  // totalWidth와 일치하도록 고정된 시간 범위 사용 (4/4 박자 기준)
  const baseTotalSeconds = 300 * baseSecondsPerMeasure;
  const secondMarkers = useMemo(() => {
    const markers = [];
    
    for (let seconds = 0; seconds <= baseTotalSeconds; seconds += 10) {
      const xPosition = (seconds - startTime) * pixelsPerSecond;
      
      // 화면에 보이는 범위 내의 마커만 추가
      if (xPosition >= -100 && xPosition <= totalWidth + 100) {
        markers.push({
          seconds: seconds,
          x: xPosition,
        });
      }
    }
    
    return markers;
  }, [baseSecondsPerMeasure, startTime, pixelsPerSecond, totalWidth]);

  const playheadTargetRef = useRef(0);
  const playheadRenderRef = useRef<number | null>(null);
  const playheadRafRef = useRef<number | null>(null);
  const playheadPerfRef = useRef<number | null>(null);

  useEffect(() => {
    const updatePlayhead = (renderTime: number) => {
      if (!playheadRef.current) return;
      const x = (renderTime - startTime) * pixelsPerSecond;
      const isVisible = x >= 0 && x <= totalWidth;
      const canInteract = !(disableInteraction || ui.editingPartId !== null);
      playheadRef.current.style.transform = `translateX(${x}px)`;
      playheadRef.current.style.opacity = isVisible ? '1' : '0';
      playheadRef.current.style.pointerEvents = isVisible && canInteract ? 'auto' : 'none';
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
  }, [pixelsPerSecond, startTime, totalWidth, disableInteraction, ui.editingPartId]);

  // 플레이헤드 위치 계산 (메모이제이션)

  // 룰러 클릭 핸들러 (플레이 헤드를 클릭한 위치로 이동하고 드래그 시작)
  const handleRulerMouseDown = useCallback((e: React.MouseEvent) => {
    // 에디터가 열려있거나 상호작용이 비활성화된 경우 로케이터 조작 비활성화
    if (disableInteraction || ui.editingPartId !== null) {
      return;
    }

    // 플레이 헤드 자체를 클릭한 경우는 무시 (플레이 헤드의 onMouseDown에서 처리)
    if (e.target instanceof HTMLElement && e.target.classList.contains(styles.playhead)) {
      return;
    }

    if (!rulerContentRef.current) return;
    const rect = rulerContentRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const newTime = Math.max(0, (x / pixelsPerSecond) + startTime);
    
    // Ctrl+Alt+클릭: 범위 드래그 (시작점 설정 후 범위 드래그)
    if ((e.ctrlKey || e.metaKey) && e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      
      // 퀀타이즈 적용
      let quantizedTime = newTime;
      if (isQuantizeEnabledRef.current) {
        const beatUnit = timeSignature[1];
        const noteValueRatio = 4 / beatUnit;
        const secondsPerBeat = (60 / bpm) * noteValueRatio;
        quantizedTime = Math.round(newTime / secondsPerBeat) * secondsPerBeat;
        quantizedTime = Math.max(0, quantizedTime);
      }
      
      ui.setExportRangeStart(quantizedTime);
      saveExportRangeToMeasure(quantizedTime, ui.exportRangeEnd);
      // 범위 드래그 시작
      setIsDraggingRange(true);
      setRangeDragStart(quantizedTime);
      return;
    }
    
    // Ctrl+클릭: Left Locator (왼쪽 로케이터만 드래그)
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      
      // Tick 기반 퀀타이즈 적용 (SMF 표준 정합)
      let quantizedTime = newTime;
      if (isQuantizeEnabledRef.current) {
        const project = getProject();
        const projectTimeSignature = getTimeSignature(project);
        const ppqn = getPpqn(project);
        const tempoMap = project.timing?.tempoMap ?? [];
        // 시간을 Tick으로 변환
        const { startTick: newTimeTick } = secondsToTicksPure(
          newTime,
          0,
          tempoMap,
          projectTimeSignature,
          ppqn
        );
        
        // Tick 기반 퀀타이즈 (1 beat = PPQN ticks) - 프로젝트의 실제 PPQN 사용
        const ticksPerBeat = ppqn;
        const snappedTimeTick = Math.round(newTimeTick / ticksPerBeat) * ticksPerBeat;
        
        // Tick을 다시 초로 변환
        const { startTime: snappedTime } = ticksToSecondsPure(
          snappedTimeTick,
          0,
          tempoMap,
          projectTimeSignature,
          ppqn
        );
        quantizedTime = Math.max(0, snappedTime);
      }
      
      ui.setExportRangeStart(quantizedTime);
      saveExportRangeToMeasure(quantizedTime, ui.exportRangeEnd);
      // 왼쪽 로케이터 드래그 시작
      setIsDraggingLeftLocator(true);
      return;
    }
    
    // Alt+클릭: Right Locator (오른쪽 로케이터만 드래그)
    if (e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      
      // Tick 기반 퀀타이즈 적용 (SMF 표준 정합)
      let quantizedTime = newTime;
      if (isQuantizeEnabledRef.current) {
        const project = getProject();
        const projectTimeSignature = getTimeSignature(project);
        const ppqn = getPpqn(project);
        const tempoMap = project.timing?.tempoMap ?? [];
        // 시간을 Tick으로 변환
        const { startTick: newTimeTick } = secondsToTicksPure(
          newTime,
          0,
          tempoMap,
          projectTimeSignature,
          ppqn
        );
        
        // Tick 기반 퀀타이즈 (1 beat = PPQN ticks) - 프로젝트의 실제 PPQN 사용
        const ticksPerBeat = ppqn;
        const snappedTimeTick = Math.round(newTimeTick / ticksPerBeat) * ticksPerBeat;
        
        // Tick을 다시 초로 변환
        const { startTime: snappedTime } = ticksToSecondsPure(
          snappedTimeTick,
          0,
          tempoMap,
          projectTimeSignature,
          ppqn
        );
        quantizedTime = Math.max(0, snappedTime);
      }
      
      ui.setExportRangeEnd(quantizedTime);
      saveExportRangeToMeasure(ui.exportRangeStart, quantizedTime);
      // 오른쪽 로케이터 드래그 시작
      setIsDraggingRightLocator(true);
      return;
    }
    
    // 일반 클릭: 플레이 헤드를 클릭한 위치로 이동
    ui.setCurrentPlaybackTime(newTime);
    
    // 드래그 모드 시작
    setIsDraggingPlayhead(true);
    
    e.preventDefault();
    e.stopPropagation();
  }, [pixelsPerSecond, startTime, ui, saveExportRangeToMeasure, disableInteraction]);

  const playheadStyle = extendPlayhead
    ? ({ ['--playhead-extend' as string]: `${playheadExtendPx}px` } as React.CSSProperties)
    : undefined;

  return (
    <div
      className={`${styles.measureRuler} ${extendPlayhead ? styles.measureRulerExtended : ''}`}
      ref={containerRef}
    >
      <div 
        ref={rulerContentRef} 
        className={styles.rulerContent} 
        style={{ width: `${totalWidth}px`, minWidth: '100%' }}
        onMouseDown={handleRulerMouseDown}
        onWheel={(e) => {
          // disableInteraction이 true이면 모든 휠 상호작용 차단
          if (disableInteraction) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          // Shift 키를 누르고 있을 때 횡 이동 (가로 스크롤)
          if (e.shiftKey && !e.altKey) {
            e.preventDefault();
            e.stopPropagation();
            const bottomScrollbar = document.getElementById('timeline-scrollbar');
            if (bottomScrollbar) {
              const scrollDelta = e.deltaY > 0 ? 50 : -50;
              bottomScrollbar.scrollLeft += scrollDelta;
            }
          }
          // Alt 키를 누르고 있을 때 횡 확대/축소 (줌)
          else if (e.altKey) {
            e.preventDefault();
            e.stopPropagation();
            const min = 10;
            const max = 200;
            const delta = e.deltaY > 0 ? -5 : 5;
            const newValue = Math.max(min, Math.min(max, pixelsPerSecond + delta));
            ui.setPixelsPerSecond(newValue);
          }
        }}
      >
        {/* 통합 마커 (마디 마커 + 박자 마커) - 같은 레이어에서 렌더링 */}
        {allMarkers.map((marker) => {
          // 모든 마커를 같은 레이어에서 렌더링, 타입에 따라 CSS 클래스만 다르게 적용
          const baseClass = marker.type === 'strong' 
            ? styles.measureMarker 
            : styles.beatMarker;
          const typeClass = marker.type === 'strong' 
            ? styles.strongMeasure 
            : marker.type === 'medium' 
            ? styles.mediumBeat 
            : '';
          
          return (
            <div
              key={`marker-${marker.measure}-${marker.beat}`}
              className={`${baseClass} ${typeClass}`}
              style={{ left: `${marker.x}px` }}
            >
              {marker.type === 'strong' ? (
                <>
                  <div className={styles.measureLine} />
                  <div className={styles.measureLabel}>{marker.measure}</div>
                </>
              ) : (
                <div className={styles.beatLine} />
              )}
            </div>
          );
        })}
        {/* 초 마커 (10초마다) */}
        {secondMarkers.map((marker) => (
          <div
            key={`second-${marker.seconds}`}
            className={styles.secondMarker}
            style={{ left: `${marker.x}px` }}
          >
            <div className={styles.secondLine} />
            <div className={styles.secondLabel}>{marker.seconds}s</div>
          </div>
        ))}
        {/* Export 범위 오버레이 */}
        {ui.exportRangeStart !== null && ui.exportRangeEnd !== null && (
          (() => {
            const rangeStartX = (ui.exportRangeStart - startTime) * pixelsPerSecond;
            const rangeEndX = (ui.exportRangeEnd - startTime) * pixelsPerSecond;
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
                  {/* Left Locator Handle */}
                  <div
                    className={styles.leftLocatorHandle}
                    style={{ 
                      left: `${rangeStartX}px`,
                      pointerEvents: disableInteraction || ui.editingPartId !== null ? 'none' : 'auto',
                      cursor: disableInteraction || ui.editingPartId !== null ? 'default' : 'ew-resize'
                    }}
                    onMouseDown={(e) => {
                      if (disableInteraction || ui.editingPartId !== null) {
                        e.preventDefault();
                        e.stopPropagation();
                        return;
                      }
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDraggingLeftLocator(true);
                    }}
                  />
                  {/* Left Locator Line */}
                  <div
                    className={styles.leftLocatorLine}
                    style={{ left: `${rangeStartX}px` }}
                  />
                  {/* Right Locator Handle */}
                  <div
                    className={styles.rightLocatorHandle}
                    style={{ 
                      left: `${rangeEndX}px`,
                      pointerEvents: disableInteraction || ui.editingPartId !== null ? 'none' : 'auto',
                      cursor: disableInteraction || ui.editingPartId !== null ? 'default' : 'ew-resize'
                    }}
                    onMouseDown={(e) => {
                      if (disableInteraction || ui.editingPartId !== null) {
                        e.preventDefault();
                        e.stopPropagation();
                        return;
                      }
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDraggingRightLocator(true);
                    }}
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
          })()
        )}
        
        {/* Left Locator Handle만 있는 경우 */}
        {ui.exportRangeStart !== null && ui.exportRangeEnd === null && (
          (() => {
            const rangeStartX = (ui.exportRangeStart - startTime) * pixelsPerSecond;
            if (rangeStartX >= -totalWidth && rangeStartX <= totalWidth) {
              return (
                <>
                  <div
                    className={styles.leftLocatorHandle}
                    style={{ left: `${rangeStartX}px` }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDraggingLeftLocator(true);
                    }}
                  />
                  <div
                    className={styles.leftLocatorLine}
                    style={{ left: `${rangeStartX}px` }}
                  />
                </>
              );
            }
            return null;
          })()
        )}
        
        {/* Right Locator Handle만 있는 경우 */}
        {ui.exportRangeStart === null && ui.exportRangeEnd !== null && (
          (() => {
            const rangeEndX = (ui.exportRangeEnd - startTime) * pixelsPerSecond;
            if (rangeEndX >= -totalWidth && rangeEndX <= totalWidth) {
              return (
                <>
                  <div
                    className={styles.rightLocatorHandle}
                    style={{ 
                      left: `${rangeEndX}px`,
                      pointerEvents: disableInteraction || ui.editingPartId !== null ? 'none' : 'auto',
                      cursor: disableInteraction || ui.editingPartId !== null ? 'default' : 'ew-resize'
                    }}
                    onMouseDown={(e) => {
                      if (disableInteraction || ui.editingPartId !== null) {
                        e.preventDefault();
                        e.stopPropagation();
                        return;
                      }
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDraggingRightLocator(true);
                    }}
                  />
                  <div
                    className={styles.rightLocatorLine}
                    style={{ left: `${rangeEndX}px` }}
                  />
                </>
              );
            }
            return null;
          })()
        )}

        {/* 플레이 헤드 */}
        <div
          ref={playheadRef}
          className={`${styles.playhead} ${isRecording ? styles.playheadRecording : ''} ${extendPlayhead ? styles.playheadExtended : ''}`}
          style={{ 
            transform: 'translateX(0px)',
            cursor: disableInteraction || ui.editingPartId !== null ? 'default' : 'ew-resize', 
            pointerEvents: disableInteraction || ui.editingPartId !== null ? 'none' : 'auto',
            ...playheadStyle
          }}
          onMouseDown={(e) => {
            if (disableInteraction || ui.editingPartId !== null) {
              e.preventDefault();
              e.stopPropagation();
              return;
            }
            e.preventDefault();
            e.stopPropagation();
            setIsDraggingPlayhead(true);
          }}
        />
      </div>
    </div>
  );
};

export default MeasureRuler;



