import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getProject, updateMidiPart } from '../store/projectStore';
import { secondsToTicksPure, ticksToSecondsPure, getTimeSignature, getPpqn } from '../utils/midiTickUtils';

/**
 * SustainRange 타입 정의
 */
export type SustainRange = {
  startTick: number;
  endTick: number;
};

/**
 * useSustainPedal 훅 Props
 * Phase 7.9.4: 서스테인 페달 로직을 훅으로 추출
 */
export interface UseSustainPedalProps {
  // Data
  partId: string;
  bpm: number;
  timeSignature: [number, number];
  partDuration: number;
  sustainRanges: SustainRange[];
  pixelsPerSecond: number | null;
  initialPixelsPerSecond: number;
  part?: { durationTicks?: number | null; startTick?: number | null } | null;
  
  // Refs
  velocityGraphAreaRef: React.RefObject<HTMLDivElement | null>;
  
  // Quantize
  isQuantizeEnabled: boolean;
  quantizeNote: (time: number, gridSize: number) => number;
  partStartTime: number; // 파트의 글로벌 시작 시간 (마디 기준 퀀타이즈용)
}

/**
 * useSustainPedal 훅 반환 타입
 */
export interface UseSustainPedalReturn {
  // States
  isDrawingSustain: boolean;
  setIsDrawingSustain: (value: boolean) => void;
  drawingSustain: { startTime: number; endTime?: number } | null;
  setDrawingSustain: (value: { startTime: number; endTime?: number } | null) => void;
  selectedSustainRange: Set<number>;
  setSelectedSustainRange: (value: Set<number> | ((prev: Set<number>) => Set<number>)) => void;
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
  
  // Computed
  displayedSustainRanges: SustainRange[];
  
  // Functions
  updateSustainControlChanges: (nextRanges: SustainRange[], nextSelectedIndices?: Set<number> | null) => void;
}

/**
 * 서스테인 페달 로직을 관리하는 훅
 * Phase 7.9.4: 서스테인 페달 로직을 훅으로 추출
 */
export const useSustainPedal = ({
  partId,
  bpm,
  timeSignature,
  partDuration,
  sustainRanges,
  pixelsPerSecond,
  initialPixelsPerSecond,
  part,
  velocityGraphAreaRef,
  isQuantizeEnabled,
  quantizeNote,
  partStartTime,
}: UseSustainPedalProps): UseSustainPedalReturn => {
  
  // 서스테인 페달 그리기 관련 상태
  const [isDrawingSustain, setIsDrawingSustain] = useState(false);
  const isDrawingSustainRef = useRef(false);
  const [drawingSustain, setDrawingSustain] = useState<{ startTime: number; endTime?: number } | null>(null);
  const drawingSustainRef = useRef<{ startTime: number; endTime?: number } | null>(null);
  const hasMouseMovedRef = useRef(false);
  const startMouseXRef = useRef<number | null>(null);
  const [selectedSustainRange, setSelectedSustainRange] = useState<Set<number>>(new Set());
  const [isDraggingSustainRange, setIsDraggingSustainRange] = useState(false);
  const [sustainDragStart, setSustainDragStart] = useState<{ mouseX: number; startTick: number; endTick: number } | null>(null);
  const [sustainDragPreview, setSustainDragPreview] = useState<{ startTick: number; endTick: number } | null>(null);
  // 잠재적 드래그 시작 위치 (아직 드래그로 판정되지 않음)
  const potentialDragStartRef = useRef<{ mouseX: number; rangeIndex: number; startTick: number; endTick: number } | null>(null);
  const [isResizingSustainRange, setIsResizingSustainRange] = useState(false);
  const [sustainResizeStart, setSustainResizeStart] = useState<{ mouseX: number; startTick: number; endTick: number; edge: 'left' | 'right' } | null>(null);
  const [sustainResizePreview, setSustainResizePreview] = useState<{ startTick: number; endTick: number } | null>(null);

  // drawingSustain ref 업데이트
  useEffect(() => {
    drawingSustainRef.current = drawingSustain;
  }, [drawingSustain]);

  // isDrawingSustain ref 업데이트
  useEffect(() => {
    isDrawingSustainRef.current = isDrawingSustain;
  }, [isDrawingSustain]);

  const displayedSustainRanges = useMemo(() => {
    if (!sustainRanges.length) return sustainRanges;
    return sustainRanges.map((range, index) => {
      if (selectedSustainRange.has(index)) {
        if (sustainDragPreview && selectedSustainRange.size === 1 && selectedSustainRange.has(index)) {
          return sustainDragPreview;
        }
        if (sustainResizePreview && selectedSustainRange.size === 1 && selectedSustainRange.has(index)) {
          return sustainResizePreview;
        }
      }
      return range;
    });
  }, [sustainRanges, selectedSustainRange, sustainDragPreview, sustainResizePreview]);

  const updateSustainControlChanges = useCallback((nextRanges: SustainRange[], nextSelectedIndices?: Set<number> | null) => {
    const project = getProject();
    const targetPart = project.midiParts.find(p => p.id === partId);
    if (!targetPart) return;

    const otherControlChanges = (targetPart.controlChanges ?? []).filter(cc => cc.controller !== 64);
    const fallbackMaxTick = nextRanges.length
      ? Math.max(0, ...nextRanges.map(range => Math.round(range.endTick)))
      : 0;
    const maxTick = targetPart.durationTicks && targetPart.durationTicks > 0
      ? targetPart.durationTicks
      : fallbackMaxTick;

    const sortedRanges = [...nextRanges].sort((a, b) => a.startTick - b.startTick);
    const cc64Events = sortedRanges.flatMap(range => {
      const startTick = Math.max(0, Math.min(maxTick, Math.round(range.startTick)));
      const rawEndTick = Math.min(maxTick, Math.round(range.endTick));
      const endTick = Math.max(startTick, rawEndTick);
      return [
        { tick: startTick, controller: 64, value: 100, channel: 0 },
        { tick: endTick, controller: 64, value: 0, channel: 0 },
      ];
    });

    cc64Events.sort((a, b) => (a.tick - b.tick) || (a.value - b.value));

    const nextControlChanges = [...otherControlChanges, ...cc64Events];
    updateMidiPart(partId, { controlChanges: nextControlChanges.length ? nextControlChanges : [] }, false);

    if (nextSelectedIndices !== undefined) {
      setSelectedSustainRange(nextSelectedIndices === null ? new Set() : nextSelectedIndices);
    }
  }, [partId]);

  // isDrawingSustain이 true가 될 때 마우스 위치 추적 초기화
  useEffect(() => {
    if (isDrawingSustain) {
      hasMouseMovedRef.current = false;
      startMouseXRef.current = null;
    }
  }, [isDrawingSustain]);

  useEffect(() => {
    if (!isDrawingSustain && !isDraggingSustainRange && !isResizingSustainRange) {
      return;
    }

    const handleSustainMouseMove = (event: MouseEvent) => {
      if (!velocityGraphAreaRef.current) return;
      const rect = velocityGraphAreaRef.current.getBoundingClientRect();
      // velocityGraphAreaRef는 marginLeft: pianoKeysWidth가 이미 적용되어 있으므로
      // getBoundingClientRect()는 이미 오프셋된 위치를 반환합니다.
      const x = event.clientX - rect.left;
      const currentPixelsPerSecond = pixelsPerSecond || initialPixelsPerSecond;
      const time = x / currentPixelsPerSecond;
      const relativeTime = Math.max(0, Math.min(partDuration, time));

      // ref를 사용하여 최신 값 확인
      if (isDrawingSustainRef.current && drawingSustainRef.current) {
        // 마우스가 움직였는지 확인 (드래그 감지)
        if (startMouseXRef.current !== null && Math.abs(x - startMouseXRef.current) > 2) {
          hasMouseMovedRef.current = true;
        }
        setDrawingSustain({
          ...drawingSustainRef.current,
          endTime: relativeTime,
        });
        return;
      }

      if (isDraggingSustainRange && sustainDragStart) {
        const project = getProject();
        const deltaSeconds = (x - sustainDragStart.mouseX) / currentPixelsPerSecond;
        const projectTimeSignature = getTimeSignature(project);
        const ppqn = getPpqn(project);
        const tempoMap = project.timing?.tempoMap ?? [];
        const { startTick: deltaTick } = secondsToTicksPure(
          deltaSeconds,
          0,
          tempoMap,
          projectTimeSignature,
          ppqn
        );
        let newStartTick = Math.max(0, sustainDragStart.startTick + deltaTick);
        let newEndTick = Math.max(newStartTick, sustainDragStart.endTick + deltaTick);
        
        // 퀀타이즈 적용 (마디 기준)
        if (isQuantizeEnabled) {
          const beatUnit = projectTimeSignature[1];
          const noteValueRatio = 4 / beatUnit;
          const secondsPerBeat = (60 / bpm) * noteValueRatio;
          const gridSize = secondsPerBeat;
          
          // tick을 seconds로 변환 (상대 시간)
          const { startTime: startTimeRelative } = ticksToSecondsPure(newStartTick, 0, tempoMap, projectTimeSignature, ppqn);
          const { startTime: endTimeRelative } = ticksToSecondsPure(newEndTick, 0, tempoMap, projectTimeSignature, ppqn);
          
          // 상대 시간을 절대 시간으로 변환 (마디 기준)
          const startTimeAbsolute = partStartTime + startTimeRelative;
          const endTimeAbsolute = partStartTime + endTimeRelative;
          
          // 퀀타이즈 적용 (절대 시간 기준)
          const quantizedStartTimeAbsolute = quantizeNote(startTimeAbsolute, gridSize);
          const quantizedEndTimeAbsolute = quantizeNote(endTimeAbsolute, gridSize);
          
          // 절대 시간을 상대 시간으로 변환
          const quantizedStartTimeRelative = quantizedStartTimeAbsolute - partStartTime;
          const quantizedEndTimeRelative = quantizedEndTimeAbsolute - partStartTime;
          
          // 상대 시간을 tick으로 변환
          const { startTick: quantizedStartTick } = secondsToTicksPure(quantizedStartTimeRelative, 0, tempoMap, projectTimeSignature, ppqn);
          const { startTick: quantizedEndTick } = secondsToTicksPure(quantizedEndTimeRelative, 0, tempoMap, projectTimeSignature, ppqn);
          
          newStartTick = Math.max(0, quantizedStartTick);
          newEndTick = Math.max(newStartTick, quantizedEndTick);
        }
        
        setSustainDragPreview({ startTick: newStartTick, endTick: newEndTick });
        return;
      }

      if (isResizingSustainRange && sustainResizeStart) {
        const project = getProject();
        const deltaSeconds = (x - sustainResizeStart.mouseX) / currentPixelsPerSecond;
        const projectTimeSignature = getTimeSignature(project);
        const ppqn = getPpqn(project);
        const tempoMap = project.timing?.tempoMap ?? [];
        const { startTick: deltaTick } = secondsToTicksPure(
          deltaSeconds,
          0,
          tempoMap,
          projectTimeSignature,
          ppqn
        );
        if (sustainResizeStart.edge === 'left') {
          let newStartTick = Math.max(0, Math.min(sustainResizeStart.startTick + deltaTick, sustainResizeStart.endTick));
          
          // 퀀타이즈 적용 (마디 기준)
          if (isQuantizeEnabled) {
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
            
            newStartTick = Math.max(0, Math.min(quantizedStartTick, sustainResizeStart.endTick));
          }
          
          setSustainResizePreview({ startTick: newStartTick, endTick: sustainResizeStart.endTick });
        } else {
          const maxTick = part?.durationTicks ?? sustainResizeStart.endTick + deltaTick;
          let newEndTick = Math.max(
            sustainResizeStart.startTick,
            Math.min(sustainResizeStart.endTick + deltaTick, maxTick)
          );
          
          // 퀀타이즈 적용 (마디 기준)
          if (isQuantizeEnabled) {
            const beatUnit = projectTimeSignature[1];
            const noteValueRatio = 4 / beatUnit;
            const secondsPerBeat = (60 / bpm) * noteValueRatio;
            const gridSize = secondsPerBeat;
            
            // tick을 seconds로 변환 (상대 시간)
            const { startTime: endTimeRelative } = ticksToSecondsPure(newEndTick, 0, tempoMap, projectTimeSignature, ppqn);
            
            // 상대 시간을 절대 시간으로 변환 (마디 기준)
            const endTimeAbsolute = partStartTime + endTimeRelative;
            
            // 퀀타이즈 적용 (절대 시간 기준)
            const quantizedEndTimeAbsolute = quantizeNote(endTimeAbsolute, gridSize);
            
            // 절대 시간을 상대 시간으로 변환
            const quantizedEndTimeRelative = quantizedEndTimeAbsolute - partStartTime;
            
            // 상대 시간을 tick으로 변환
            const { startTick: quantizedEndTick } = secondsToTicksPure(quantizedEndTimeRelative, 0, tempoMap, projectTimeSignature, ppqn);
            
            newEndTick = Math.max(
              sustainResizeStart.startTick,
              Math.min(quantizedEndTick, maxTick)
            );
          }
          
          setSustainResizePreview({ startTick: sustainResizeStart.startTick, endTick: newEndTick });
        }
      }
    };

    const handleSustainMouseUp = () => {
      // 잠재적 드래그 시작 위치가 있으면 클릭으로 처리 (드래그가 시작되지 않음)
      if (potentialDragStartRef.current) {
        potentialDragStartRef.current = null;
      }

      // ref를 사용하여 최신 값 확인
      if (isDrawingSustainRef.current && drawingSustainRef.current) {
        const project = getProject();
        const projectTimeSignature = getTimeSignature(project);
        
        // 한 박자 길이 계산
        const beatUnit = projectTimeSignature[1];
        const noteValueRatio = 4 / beatUnit;
        const secondsPerBeat = (60 / bpm) * noteValueRatio;
        
        // 마우스가 움직이지 않았으면 (단순 클릭) 한 박자 길이만큼 생성
        const currentDrawing = drawingSustainRef.current;
        const endTime = hasMouseMovedRef.current && currentDrawing.endTime !== undefined
          ? currentDrawing.endTime
          : currentDrawing.startTime + secondsPerBeat;
        
        // 퀀타이즈 적용 (마디 기준)
        let rangeStart = currentDrawing.startTime;
        let rangeEnd = endTime;
        if (isQuantizeEnabled) {
          const gridSize = secondsPerBeat;
          // 상대 시간을 절대 시간으로 변환 (마디 기준)
          const rangeStartAbsolute = partStartTime + rangeStart;
          const rangeEndAbsolute = partStartTime + rangeEnd;
          
          // 퀀타이즈 적용 (절대 시간 기준)
          const quantizedRangeStartAbsolute = quantizeNote(rangeStartAbsolute, gridSize);
          const quantizedRangeEndAbsolute = quantizeNote(rangeEndAbsolute, gridSize);
          
          // 절대 시간을 상대 시간으로 변환
          rangeStart = quantizedRangeStartAbsolute - partStartTime;
          rangeEnd = quantizedRangeEndAbsolute - partStartTime;
        }
        
        rangeStart = Math.min(rangeStart, rangeEnd);
        rangeEnd = Math.max(rangeStart, rangeEnd);
        
        const ppqn = getPpqn(project);
        const tempoMap = project.timing?.tempoMap ?? [];
        const rangeStartTick = secondsToTicksPure(rangeStart, 0, tempoMap, projectTimeSignature, ppqn).startTick;
        const rangeEndTick = secondsToTicksPure(rangeEnd, 0, tempoMap, projectTimeSignature, ppqn).startTick;
        const currentRanges = sustainRanges;
        const newRange: SustainRange = {
          startTick: rangeStartTick,
          endTick: rangeEndTick,
        };
        updateSustainControlChanges([...currentRanges, newRange], new Set([currentRanges.length]));
        setIsDrawingSustain(false);
        setDrawingSustain(null);
        drawingSustainRef.current = null;
        isDrawingSustainRef.current = false;
        hasMouseMovedRef.current = false;
        startMouseXRef.current = null;
      }

      if (isDraggingSustainRange && sustainDragPreview && selectedSustainRange.size === 1) {
        const selectedIndex = Array.from(selectedSustainRange)[0];
        const currentRanges = [...sustainRanges];
        currentRanges[selectedIndex] = sustainDragPreview;
        updateSustainControlChanges(currentRanges, selectedSustainRange);
        setIsDraggingSustainRange(false);
        setSustainDragStart(null);
        setSustainDragPreview(null);
      }

      if (isResizingSustainRange && sustainResizePreview && selectedSustainRange.size === 1) {
        const selectedIndex = Array.from(selectedSustainRange)[0];
        const currentRanges = [...sustainRanges];
        currentRanges[selectedIndex] = sustainResizePreview;
        updateSustainControlChanges(currentRanges, selectedSustainRange);
        setIsResizingSustainRange(false);
        setSustainResizeStart(null);
        setSustainResizePreview(null);
      }
    };

    window.addEventListener('mousemove', handleSustainMouseMove);
    window.addEventListener('mouseup', handleSustainMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleSustainMouseMove);
      window.removeEventListener('mouseup', handleSustainMouseUp);
    };
  }, [bpm, initialPixelsPerSecond, isDrawingSustain, isDraggingSustainRange, isResizingSustainRange, isQuantizeEnabled, quantizeNote, part?.durationTicks, partDuration, partStartTime, pixelsPerSecond, selectedSustainRange, sustainDragPreview, sustainDragStart, sustainRanges, sustainResizePreview, sustainResizeStart, timeSignature, updateSustainControlChanges, velocityGraphAreaRef]);

  return {
    // States
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
    
    // Computed
    displayedSustainRanges,
    
    // Functions
    updateSustainControlChanges,
  };
};

