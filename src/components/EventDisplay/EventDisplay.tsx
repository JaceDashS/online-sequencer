import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { addMidiPart, updateMidiPart, updateMultipleMidiParts, splitMidiPart, cloneMultipleMidiParts, mergeMidiParts, preparePartLevelHistoryEntries, addPartLevelHistoryEntry, setFlushPendingHistoryCallback } from '../../store/projectStore';
import { selectProject } from '../../store/selectors';
import { useEventDisplayData } from '../../hooks/useEventDisplayData';
import { useUIState, isSplitMode, isSplitByKey3Mode, isSplitByAltMode } from '../../store/uiStore';
import { useCursorModeKeyboard } from '../../hooks/useCursorModeKeyboard';
import { TIMELINE_CONSTANTS } from '../../constants/ui';
import type { MidiPart } from '../../types/project';
import MidiEditor from '../MidiEditor/MidiEditor';
import styles from './EventDisplay.module.css';
import { ticksToSecondsPure, secondsToTicksPure, ticksToMeasurePure, getPpqn, getBpm, getTimeSignature } from '../../utils/midiTickUtils';
import { getProject } from '../../store/projectStore';
import { findMidiPartById, findMidiPartsByTrackId } from '../../store/projectState';
import { MIDI_CONSTANTS } from '../../constants/midi';
import { TimelineView } from './TimelineView';
import type { EventDisplayProps, MeasureMarker } from './EventDisplayTypes';
import { RESIZE_HANDLE_WIDTH_PX } from './EventDisplayTypes';
import { usePlaybackTime } from '../../hooks/usePlaybackTime';
import {
  calculateMeasureMarkers,
  calculateTotalWidth,
  calculateSplitPreviewX,
  calculateSplitMeasure
} from './EventDisplayCalculations';

const EventDisplay: React.FC<EventDisplayProps> = ({
  bpm = 120,
  timeSignature = [4, 4],
  pixelsPerSecond = 50,
  startTime = 0,
  trackHeights = new Map(),
  onScrollSync,
  selectedTrackId,
  onTrackSelect,
  isRecording = false,
}) => {
  // Step 10: EventDisplay? ??? ???(useEventDisplayData)? ? ???(TimelineView)? ???? ??? ?????
  const ui = useUIState();
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  
  // Step 10: ??? ??? - useEventDisplayData ??? ??? ????
  const { tracks } = useEventDisplayData();
  
  // PPQN ????
  const project = selectProject();
  const ppqn = getPpqn(project);
  
  // Alt ? ??
  const prevAltPressedRef = useRef(false);
  // ?? ??? ?? ?? (3? ?? ??? ? ?? ???? ? ???)
  const globalMousePositionRef = useRef<{ x: number; y: number } | null>(null);
  
  // ?? ??? ??? UI store?? ??
  const isDraggingPart = ui.isDraggingPart;
  const [draggedPartId, setDraggedPartId] = useState<string | null>(null); // ?? ???? (??? ??? ??)
  const [draggedPartsInfo, setDraggedPartsInfo] = useState<Array<{ partId: string; originalStartTick: number; originalTrackId: string }>>([]); // ?? ????? ????? (tick ??)
  const [partDragStart, setPartDragStart] = useState<{ x: number; y: number; partStartTick: number; partTrackId: string; clickOffsetX: number } | null>(null);
  const [partDragOffset, setPartDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const partDragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 }); // ?? offset? ?? ???? ?? ref
  const [hasDraggedPart, setHasDraggedPart] = useState(false); // ??? ???? ????? ??
  const [isTrackMovingMode, setIsTrackMovingMode] = useState(false); // ?? ? ?? ???? ??
  const [isCtrlPressedDuringDrag, setIsCtrlPressedDuringDrag] = useState(false); // ??? ? Ctrl ? ?? (??? ?? ??? ?? ??)
  const dragOriginRef = useRef<{ startTick: number; trackId: string } | null>(null); // ??? ?? ??? ?? ?? (??? ????, tick ??)
  const isCtrlPressedRef = useRef(false); // ?? Ctrl ? ??? ?? ref
  const lastClickTimeRef = useRef<number>(0); // ???? ??? ?? ??? ?? ??
  const pendingUpdateTimerRef = useRef<number | null>(null); // ??? ???? ?? ???
  const pendingHistoryEntriesRef = useRef<Array<{ partId: string; oldPart: MidiPart; newPart: Partial<MidiPart> }> | null>(null); // ??? ???? ???
  const isHistoryFlushedRef = useRef<boolean>(false); // ????? ?? ?????? ???

  // hoveredPartId? UI store?? ??
  const hoveredPartId = ui.hoveredPartId;
  const [splitPreviewX, setSplitPreviewX] = useState<number | null>(null); // ?? ?? ???? X ??
  const [splitPreviewPartId, setSplitPreviewPartId] = useState<string | null>(null); // ????? ???? ?? ID

  // ?? ?? ??? ???
  const { handleKey3, handleKey4, handleKey1, handleAltKey } = useCursorModeKeyboard({
    onSplitModeDeactivate: () => {
      setSplitPreviewX(null);
      setSplitPreviewPartId(null);
    },
    onAltKeyPress: () => {
      prevAltPressedRef.current = true;
    },
    shouldActivateSplitOnAlt: !isDraggingPart,
    stopPropagation: false,
  });
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ?? ??, ??, select ?? ???? ??? ??? ??? ??
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

      // 3? ?: splitByKey3 ?? ?? (EventDisplay ?? ??: ???? ? ??)
      if (e.key === '3' || e.key === 'Digit3') {
        handleKey3(e);
        // 3? ?? ??? ? ???? ?? ?? ??? ???? ? ??
        if (!isSplitByKey3Mode(ui.cursorMode) && hoveredPartId && contentRef.current && globalMousePositionRef.current) {
          const part = findMidiPartById(hoveredPartId);
          if (part) {
            const rect = contentRef.current.getBoundingClientRect();
            const x = globalMousePositionRef.current.x - rect.left;
            
            // Tick ?? ?? ?? ?? ?? (SMF ?? ??)
            // props? ?? timeSignature? ?? ???? ?? ???? ?? ? ?? ??
            const project = getProject();
            const partStartTick = part.startTick;
            const partDurationTicks = part.durationTicks;
            const projectTimeSignature = timeSignature || getTimeSignature(project);
            const projectPpqn = ppqn || getPpqn(project);
            const tempoMap = project.timing?.tempoMap ?? [];
            const { startTime: partStartTime, duration: partDuration } = ticksToSecondsPure(
              partStartTick,
              partDurationTicks,
              tempoMap,
              projectTimeSignature,
              projectPpqn
            );
            const partX = partStartTime * pixelsPerSecond;
            const partWidth = partDuration * pixelsPerSecond;
            
            // ?? ??? ??? ??
            if (x >= partX && x <= partX + partWidth) {
              setSplitPreviewX(x);
              setSplitPreviewPartId(part.id);
            }
          }
        }
      }
      // Q: ???? ??
      else if (e.key === 'q' || e.key === 'Q') {
        e.preventDefault();
        ui.toggleQuantize();
      }
      // Alt ?: splitByAlt ?? ???? handleMouseMove?? ?? (?? ?? ??)
      // keydown ?????? ???? ??
      // 4? ?: mergeByKey4 ?? ?? (MIDI ???? ????? MIDI ????? ????? ???)
      else if ((e.key === '4' || e.key === 'Digit4') && !ui.editingPartId) {
        handleKey4(e);
      }
      // 1? ?: splitByKey3 ? mergeByKey4 ?? ????
      else if (e.key === '1' || e.key === 'Digit1') {
        handleKey1(e);
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      // ?? ??, ??, select ?? ???? ??? ??? ??? ??
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

      // Alt ?? ??? ? splitByAlt ?? ????
      if (e.key === 'Alt') {
        if (isSplitByAltMode(ui.cursorMode)) {
          ui.setCursorMode(null);
          setSplitPreviewX(null);
          setSplitPreviewPartId(null);
        }
        prevAltPressedRef.current = false;
      }
    };
    
    // ??? ?????? Alt ? ?? ?? (Alt ?? ??? ?? ? ???? ???? keydown ???? ???? ?? ? ??)
    const handleMouseMove = (e: MouseEvent) => {
      // ?? ??? ?? ??
      globalMousePositionRef.current = { x: e.clientX, y: e.clientY };
      
      // ?? ?? ???? ?? ??? ??? split ?? ????? ??
      if (isDraggingPart || isDragging) {
        return;
      }
      
      const wasAltPressed = prevAltPressedRef.current;
      const isAltPressedNow = e.altKey;
      // Alt ? ??? ????? ?? ???? (splitByKey3 ??? ??)
      if (isAltPressedNow !== wasAltPressed && !isSplitByKey3Mode(ui.cursorMode)) {
        prevAltPressedRef.current = isAltPressedNow;
        // Alt ?? ??? ?? ??? ???? ?? ?? splitByAlt ?? ???
        if (isAltPressedNow && hoveredPartId) {
          ui.setCursorMode('splitByAlt');
        } else if (isSplitByAltMode(ui.cursorMode)) {
          ui.setCursorMode(null);
          setSplitPreviewX(null);
          setSplitPreviewPartId(null);
        }
      }
      // Alt ?? ??? ??? ??? ???? ??? ?? splitByAlt ?? ????
      if (isAltPressedNow && !hoveredPartId && isSplitByAltMode(ui.cursorMode)) {
        ui.setCursorMode(null);
        setSplitPreviewX(null);
        setSplitPreviewPartId(null);
      }
      // Alt ?? ??? ??? ??? ???? ?? splitByAlt ??? ?? ????
      if (!isAltPressedNow && isSplitByAltMode(ui.cursorMode)) {
        ui.setCursorMode(null);
        setSplitPreviewX(null);
        setSplitPreviewPartId(null);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [hoveredPartId, ui.cursorMode, ui, handleKey3, handleKey4, handleKey1, handleAltKey, isDraggingPart, bpm, timeSignature, pixelsPerSecond, contentRef]);

  // split ??? ? ?? ??? ?? ???? ???? ? ????
  useEffect(() => {
    if (!isSplitMode(ui.cursorMode)) {
      setSplitPreviewX(null);
      setSplitPreviewPartId(null);
      return;
    }

    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!contentRef.current || !hoveredPartId) return;

      const rect = contentRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;

      // ?? ??? ??? ?? ?? ?? ??? ??
      const part = findMidiPartById(hoveredPartId);
      if (!part) return;

      // ??? ??? ???? ??? ???? ??
      const project = getProject();
      const projectTimeSignature = timeSignature || getTimeSignature(project);
      const projectPpqn = ppqn || getPpqn(project);
      const tempoMap = project.timing?.tempoMap ?? [];
      
      const previewX = calculateSplitPreviewX({
        mouseX: x,
        part,
        pixelsPerSecond,
        timeSignature: projectTimeSignature,
        ppqn: projectPpqn,
        tempoMap,
        isQuantizeEnabled: ui.isQuantizeEnabled,
        bpm: bpm ?? getBpm(project)
      });
      
      if (previewX !== null) {
        setSplitPreviewX(previewX);
        setSplitPreviewPartId(part.id);
      } else {
        setSplitPreviewX(null);
        setSplitPreviewPartId(null);
      }
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
    };
  }, [hoveredPartId, bpm, timeSignature, pixelsPerSecond, ui.cursorMode, ui.isQuantizeEnabled, ui]);

  // Alt ?? ??? ??? ??? ? Split ???
  useEffect(() => {
    // splitByKey3 ??? ?? ? ??? ???? ??
    if (isSplitByKey3Mode(ui.cursorMode)) {
      return;
    }
    
    // ??? ??? split ??? ????
    if (isDraggingPart) {
      if (isSplitByAltMode(ui.cursorMode)) {
        ui.setCursorMode(null);
      }
      return;
    }
    
    // splitByAlt ??? ????? ?? ??? ???? ??? ????
    if (!hoveredPartId && isSplitByAltMode(ui.cursorMode)) {
      ui.setCursorMode(null);
    }
  }, [hoveredPartId, isDraggingPart, ui]);

  // ??? ? Ctrl ? ?? ?? (?? ???)
  useEffect(() => {
    if (!isDraggingPart) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // ?? ??, ??, select ?? ???? ??? ??? ??? ??
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
        isCtrlPressedRef.current = true;
        setIsCtrlPressedDuringDrag(true);
        ui.setDuplicateModeActive(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // ?? ??, ??, select ?? ???? ??? ??? ??? ??
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
        isCtrlPressedRef.current = false;
        setIsCtrlPressedDuringDrag(false);
        ui.setDuplicateModeActive(false);
      }
    };

    // ??? ?????? Ctrl ? ?? ??
    const handleMouseMove = (e: MouseEvent) => {
      const wasCtrlPressed = isCtrlPressedRef.current;
      const isCtrlPressedNow = e.ctrlKey || e.metaKey;
      if (wasCtrlPressed !== isCtrlPressedNow) {
        isCtrlPressedRef.current = isCtrlPressedNow;
        setIsCtrlPressedDuringDrag(isCtrlPressedNow);
        ui.setDuplicateModeActive(isCtrlPressedNow);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [isDraggingPart, ui]);
  
  // Step 8: ???? ?? ?? ? ??? ??????? useEventDisplayData ? ??? ???

  // ?? ?? ? ?? ??? ????? ???
  // ???? ??? ????? ??? ?? ? ??? ????? ??
  // MIDI ?? ?? ??? ??? ???? ?? (handlePartClick?? ??)

  // MeasureRuler? ??? ?? ?? (??????)
  // ?? ?? ??? ??/??? ?? ??? timeSignature? ???? ??? ?? ?? ??
  // 4/4 ?? ???? 300??? ?? ??? ??
  const totalWidth = useMemo(() => {
    return calculateTotalWidth(bpm, pixelsPerSecond);
  }, [bpm, pixelsPerSecond]);

  // ?? ??? ??? (MeasureRuler? ??? ??)
  // container? bottomScrollbar? ????? ???
  useEffect(() => {
    if (!contentRef.current || !containerRef.current) return;

    const content = contentRef.current;
    const container = containerRef.current;
    const bottomScrollbar = document.getElementById('timeline-scrollbar');
    
    if (!content || !bottomScrollbar) return;

    let isUpdating = false;

    // ?? ????? ???? ???? container? ???
    const handleBottomScrollbarScroll = (e: Event) => {
      if (isUpdating) return;
      const target = e.target;
      if (target && target instanceof HTMLElement && target === bottomScrollbar) {
        isUpdating = true;
        const scrollLeft = target.scrollLeft;
        content.style.transform = `translateX(-${scrollLeft}px)`;
        container.scrollLeft = scrollLeft;
        requestAnimationFrame(() => {
          isUpdating = false;
        });
      }
    };

    // container? ???? ?? ????? ???
    const handleContainerScroll = () => {
      if (isUpdating) return;
      isUpdating = true;
      const scrollLeft = container.scrollLeft;
      bottomScrollbar.scrollLeft = scrollLeft;
      requestAnimationFrame(() => {
        isUpdating = false;
      });
    };

    bottomScrollbar.addEventListener('scroll', handleBottomScrollbarScroll);
    container.addEventListener('scroll', handleContainerScroll, { passive: true });

    return () => {
      bottomScrollbar.removeEventListener('scroll', handleBottomScrollbarScroll);
      container.removeEventListener('scroll', handleContainerScroll);
    };
  }, [totalWidth]);

  // EventDisplay ??? ??? ?? ? TrackList? ???
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !onScrollSync) return;

    let isScrolling = false;

    const handleScroll = () => {
      if (!isScrolling) {
        isScrolling = true;
        const scrollTop = container.scrollTop;
        onScrollSync(scrollTop);
        requestAnimationFrame(() => {
          isScrolling = false;
        });
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [onScrollSync]);

  // ?????: ?????? ??? ??
  const playbackTime = usePlaybackTime();
  const autoScrollTargetRef = useRef(playbackTime);
  const autoScrollRenderRef = useRef<number | null>(null);
  const autoScrollPerfRef = useRef<number | null>(null);
  const autoScrollRafRef = useRef<number | null>(null);
  const autoScrollPixelsPerSecondRef = useRef(pixelsPerSecond);
  const autoScrollEnabledRef = useRef(ui.isAutoScrollEnabled);

  useEffect(() => {
    autoScrollPixelsPerSecondRef.current = pixelsPerSecond;
  }, [pixelsPerSecond]);

  useEffect(() => {
    autoScrollEnabledRef.current = ui.isAutoScrollEnabled;
    if (!ui.isAutoScrollEnabled) {
      autoScrollRenderRef.current = null;
      autoScrollPerfRef.current = null;
      if (autoScrollRafRef.current !== null) {
        cancelAnimationFrame(autoScrollRafRef.current);
        autoScrollRafRef.current = null;
      }
    }
  }, [ui.isAutoScrollEnabled]);

  useEffect(() => {
    autoScrollTargetRef.current = playbackTime;
    if (!ui.isAutoScrollEnabled || autoScrollRafRef.current !== null) {
      return;
    }

    const tick = (now: number) => {
      autoScrollRafRef.current = null;
      if (!autoScrollEnabledRef.current) {
        return;
      }

      const container = containerRef.current;
      const bottomScrollbar = document.getElementById('timeline-scrollbar');
      if (!container || !bottomScrollbar) {
        return;
      }

      const targetTime = autoScrollTargetRef.current;
      let renderTime = autoScrollRenderRef.current ?? targetTime;
      const lastPerf = autoScrollPerfRef.current;
      const elapsed = lastPerf ? Math.max(0, (now - lastPerf) / 1000) : 0;
      autoScrollPerfRef.current = now;

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

      autoScrollRenderRef.current = renderTime;

      const viewportWidth = container.clientWidth;
      const currentScrollLeft = container.scrollLeft;
      const playheadPixelX = (renderTime - startTime) * autoScrollPixelsPerSecondRef.current;
      const rightEdge = currentScrollLeft + viewportWidth;

      if (playheadPixelX >= rightEdge) {
        const maxScrollLeft = Math.max(0, container.scrollWidth - viewportWidth);
        const targetPage = Math.floor(playheadPixelX / viewportWidth);
        const targetScrollLeft = Math.min(
          maxScrollLeft,
          Math.max(0, targetPage * viewportWidth)
        );
        console.log('[EventDisplay][AutoScroll] Right edge reached', {
          playbackTime,
          renderTime,
          targetTime: autoScrollTargetRef.current,
          pixelsPerSecond: autoScrollPixelsPerSecondRef.current,
          startTime,
          playheadPixelX,
          currentScrollLeft,
          rightEdge,
          viewportWidth,
          targetPage,
          containerScrollWidth: container.scrollWidth,
          maxScrollLeft,
          targetScrollLeft,
          isAutoScrollEnabled: autoScrollEnabledRef.current
        });
        bottomScrollbar.scrollLeft = targetScrollLeft;
        console.log('[EventDisplay][AutoScroll] Horizontal scroll applied', {
          prevScrollLeft: currentScrollLeft,
          newScrollLeft: bottomScrollbar.scrollLeft,
          delta: bottomScrollbar.scrollLeft - currentScrollLeft
        });
      }

      if (Math.abs(autoScrollTargetRef.current - renderTime) > 0.001) {
        autoScrollRafRef.current = requestAnimationFrame(tick);
      }
    };

    autoScrollRafRef.current = requestAnimationFrame(tick);
  }, [playbackTime, ui.isAutoScrollEnabled]);

  // ?? ??? ?? (??????)
  // ?? ????? ??? ?? ?? ?? ??
  // props? ?? timeSignature? ???? ?? ???? ?? ? ?? ??
  const measureMarkers = useMemo<MeasureMarker[]>(() => {
    return calculateMeasureMarkers(bpm, timeSignature, pixelsPerSecond, startTime, 150);
  }, [bpm, pixelsPerSecond, startTime, timeSignature]);

  // Step 9.2: ????? ?? ????? TimelineView ??? ???

  // ????? ?? ?? (??????)

  // Ctrl+???? ?? ??
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number; trackId: string } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number } | null>(null);
  const [editingPartId, setEditingPartId] = useState<string | null>(null);
  
  // ???? ??
  const [isSelectingClips, setIsSelectingClips] = useState(false);
  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<{ x: number; y: number } | null>(null);
  const justFinishedMarqueeSelectionRef = useRef(false); // ????? ?? ?????? ??
  
  // ??? ?? ??? ??
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  
  // ?? ???? ??
  const [isResizingPart, setIsResizingPart] = useState(false);
  const [resizePartId, setResizePartId] = useState<string | null>(null);
  const [resizeSide, setResizeSide] = useState<'left' | 'right' | null>(null);
  const [resizeStart, setResizeStart] = useState<{ x: number; originalDurationTicks: number; originalStartTick: number } | null>(null);
  const [resizePreview, setResizePreview] = useState<{ startTick: number; durationTicks: number } | null>(null);

  // ???? ? ?? ??
  useEffect(() => {
    if (isResizingPart) {
      document.body.style.cursor = 'none';
      return () => {
        document.body.style.cursor = '';
      };
    }
  }, [isResizingPart]);

  // merge ??? ? ??? ???? ??
  useEffect(() => {
    if (ui.cursorMode === 'mergeByKey4') {
      // ??? ??? ?? SVG ??? URL ??
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
    }
  }, [ui.cursorMode]);

  const handleMouseDown = (e: React.MouseEvent, trackId: string) => {
    // Alt ?? ??? ?? ?? ??? ?? (? ?? ??)
    if (e.altKey) {
      e.preventDefault();
      e.stopPropagation(); // split ?? ??? ??
      const rect = contentRef.current?.getBoundingClientRect();
      if (!rect) return;
      
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      setIsDragging(true);
      setDragStart({ x, y, trackId });
      setDragCurrent({ x, y });
    } else {
      // ?? ????? ?? ??? ???? ?? (??? ????? ????? ??)
      // ?? ??? ??
      if (onTrackSelect && selectedTrackId !== trackId) {
        onTrackSelect(trackId);
      }
      
      // ??? ?? ? ?? ?? ? ?? ??
      ui.clearSelectedClipIds();
    }
  };

  // ? ?? ??? ?? ? ?? ?? ?? (??? ?? ?? ??)
  const handleContentMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // ?? ??? ??
    if (e.button !== 0) {
      return;
    }
    
    // ???? ??? ?? ? ??? ??? ???? ??
    if (!(e.target instanceof HTMLElement)) {
      return;
    }
    const target = e.target;
    
    const clipClosest = target.closest(`.${styles.clip}`);
    const trackClosest = target.closest(`.${styles.eventTrack}`);
    
    // ??? ??? ??? ?? (?? ????? ??)
    if (clipClosest) {
      return;
    }
    
    // ?? ?? ??? ? ??? ??? ??? ?? ?? ?? (??? ????? ???? ??)
    // eventContent ??? ?????, measureDivider? ?????, ?? ?? ??? ? ??? ??? ?? ??
    const isCurrentTarget = target === e.currentTarget;
    const hasMeasureDivider = target.classList.contains(styles.measureDivider);
    const isTrackLaneEmptySpace = trackClosest !== null; // ?? ?? ??? ? ??
    
    if (isCurrentTarget || hasMeasureDivider || isTrackLaneEmptySpace) {
      // Alt ?? ??? ??? ??? ?? ?? ??? ??? ? ???? ??
      if (e.altKey) {
        return;
      }
      
      // ?? ?? ??
      const rect = contentRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }
      
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      setIsSelectingClips(true);
      setSelectionStart({ x, y });
      setSelectionEnd({ x, y });
      
      // ?? ?? ??
      ui.clearSelectedClipIds();
      
      // ?? ??? ?? (??? ?? ?)
      if (onTrackSelect) {
        onTrackSelect(null);
      }
    }
  }, [contentRef, ui, onTrackSelect, styles.clip, styles.eventTrack, styles.measureDivider]);

  // ? ?? ?? ? ??? ??
  const handleContentClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // ????? ?? ?????? click ??? ??
    if (justFinishedMarqueeSelectionRef.current) {
      justFinishedMarqueeSelectionRef.current = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    
    // ???? ??? ?? ? ??? ??? ???? ??? ??
    if (!(e.target instanceof HTMLElement)) return;
    const target = e.target;
    // eventContent ??? ?????, measureDivider? ??? ??
    if ((target === e.currentTarget || target.classList.contains(styles.measureDivider)) && onTrackSelect) {
      onTrackSelect(null);
      // ?? ??? ??
      ui.clearSelectedClipIds();
    }
  }, [onTrackSelect, ui]);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && dragStart && dragCurrent) {
      const rect = contentRef.current?.getBoundingClientRect();
      if (!rect) return;
      
      const x = e.clientX - rect.left;
      setDragCurrent({ x, y: dragCurrent.y });
    }
    
    
    // ???? ??? ?
    if (isDraggingPart && partDragStart) {
      const rect = contentRef.current?.getBoundingClientRect();
      if (!rect) return;
      
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      let offsetX = x - partDragStart.x;
      const offsetY = y - partDragStart.y;
      
      // ????? ????? ??? ??? ??? ??
      if (ui.isQuantizeEnabled && draggedPartId) {
        const basePart = findMidiPartById(draggedPartId);
        if (basePart) {
          const beatUnit = timeSignature[1];
          const noteValueRatio = 4 / beatUnit;
          const secondsPerBeat = (60 / bpm) * noteValueRatio;
          
          // ?? startTime ?? (tick ??)
          // props? ?? timeSignature? ?? ???? ?? ???? ?? ? ?? ??
          const projectTimeSignature = timeSignature || getTimeSignature(project);
          const projectPpqn = ppqn || getPpqn(project);
          const tempoMap = project.timing?.tempoMap ?? [];
          const { startTime: currentStartTime } = ticksToSecondsPure(
            partDragStart.partStartTick,
            basePart.durationTicks,
            tempoMap,
            projectTimeSignature,
            projectPpqn
          );
          
          // ?? startTime + offset? ?? ??? ??
          const rawStartTime = currentStartTime + offsetX / pixelsPerSecond;
          const snappedStartTime = Math.round(rawStartTime / secondsPerBeat) * secondsPerBeat;
          
          // ??? ??? ?? ?? ????? ??
          offsetX = (snappedStartTime - currentStartTime) * pixelsPerSecond;
        }
      }
      
      // ?? ?? ?? ????? ???? ?? (5px ??)
      if (Math.abs(offsetX) > 5 || Math.abs(offsetY) > 5) {
        setHasDraggedPart(true);
      }
      
      // ??? ?? ? x?? y? ? ? ?? ??? ? ??
      // x??? ? ?? ????? ?? ????? ??
      // ?? ? ?? ?? ??: Y ???? ??? ?? ? ?? ??
      const absOffsetY = Math.abs(offsetY);
      const MIN_MOVE_THRESHOLD = 5;
      
      // ?? ?? ???? ??? ?? (isTrackMovingMode? true?? Y ???? ?? ??)? ?? ??
      // ??? ?? ?? ???? ??? ? x???? ???? ??? ???? ??
      let shouldAllowTrackMoving = false;
      
      if (isTrackMovingMode && Math.abs(partDragOffsetRef.current.y) > 0) {
        // ?? ?? ???? ??? ??: ?? ??
        shouldAllowTrackMoving = true;
      } else if (absOffsetY > MIN_MOVE_THRESHOLD) {
        // Y ???? ???? ??? ?? ? ?? ??
        setIsTrackMovingMode(true);
        shouldAllowTrackMoving = true;
      } else {
        // Y ???? ??? ??? ?? ????? ??
        setIsTrackMovingMode(false);
        shouldAllowTrackMoving = false;
      }
      
      // ?? ? ?? ??? ??? Y ???? 0?? ?? (??????? ???? ??)
      // shouldAllowTrackMoving? ???? ?? ???? ?? ?? ??
      const finalOffsetY = shouldAllowTrackMoving ? offsetY : 0;
      
      const newOffset = { x: offsetX, y: finalOffsetY };
      partDragOffsetRef.current = newOffset; // ref? ?? ??
      setPartDragOffset(newOffset);
    }
    
  };

  const handleMouseUp = () => {
    if (isDragging && dragStart && dragCurrent) {
      // ?? ??
      const startTime = Math.min(dragStart.x, dragCurrent.x) / pixelsPerSecond;
      const endTime = Math.max(dragStart.x, dragCurrent.x) / pixelsPerSecond;
      const duration = endTime - startTime;
      
      if (duration > TIMELINE_CONSTANTS.MIN_CLIP_DURATION) {
        // Tick ?? ?? ?? (SMF ?? ??)
        // props? ?? timeSignature? ?? ???? ?? ???? ?? ? ?? ??
        const project = getProject();
        const finalStartTime = Math.max(0, startTime);
        const projectTimeSignature = timeSignature || getTimeSignature(project);
        const projectPpqn = ppqn || getPpqn(project);
        const tempoMap = project.timing?.tempoMap ?? [];
        const { startTick: partStartTick, durationTicks: partDurationTicks } = secondsToTicksPure(
          finalStartTime,
          duration,
          tempoMap,
          projectTimeSignature,
          projectPpqn
        );
        
        // Tick ?? ?? ?? (SMF ?? ??)
        const newPart: MidiPart = {
          id: `part-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          trackId: dragStart.trackId,
          startTick: partStartTick,
          durationTicks: partDurationTicks,
          notes: [],
        };
        
        addMidiPart(newPart);
        // pub-sub? ???? ??????? forceUpdate ???
      }
      
      setIsDragging(false);
      setDragStart(null);
      setDragCurrent(null);
    }
    
    // ???? ??
    if (isSelectingClips) {
      setIsSelectingClips(false);
      setSelectionStart(null);
      setSelectionEnd(null);
    }
  };

  // ?? ?? ?? ?? (????? ?? ?? ??? ?? ??)
  const calculateDropPosition = useCallback(() => {
    if (!isDraggingPart || !partDragStart || !draggedPartId || draggedPartsInfo.length === 0) {
      return null;
    }

    if (!draggedPartId) {
      return null;
    }
    const basePart = findMidiPartById(draggedPartId);
    if (!basePart) {
      return null;
    }

    // ref?? ?? offset ???? (?? ???? ?? ?? ??)
    const currentOffset = partDragOffsetRef.current;

    // Tick ?? ?? ??? ?? ?? (SMF ?? ??)
    // ?? ????? ?? Tick ?? (?? tick??? ?? ??)
    const baseCurrentStartTick = partDragStart.partStartTick;
    
    // X ???? ???? ?? ? Tick?? ??
    // currentOffset.x? ??? ?? ????? ??? ??
    // (?? ???? ??? ?? ? ?? ???? ??? ??? ?????,
    //  ?? ?? ???? ??? ?? ??? ??)
    const finalOffsetX = currentOffset.x;
    const offsetTime = finalOffsetX / pixelsPerSecond;
    
    // offsetTime? ??? ?? ??? ???? ?? ?? ??
    // ?? BPM ?? ?? (???? ??? ?? ???? ?? ???? ??)
    const project = getProject();
    const effectiveBpm = bpm ?? getBpm(project);
    // props? ?? timeSignature? ppqn? ?? ???? ?? ???? ?? ? ?? ??
    const effectiveTimeSignature = timeSignature || getTimeSignature(project);
    const effectivePpqn = ppqn || getPpqn(project);
    const beatUnit = effectiveTimeSignature[1];
    const noteValueRatio = 4 / beatUnit;
    const secondsPerBeat = (60 / effectiveBpm) * noteValueRatio;
    const ticksPerSecond = effectivePpqn / secondsPerBeat;
    const offsetTicks = Math.round(offsetTime * ticksPerSecond);
    
    // ??? Tick ?? ?? (??? ????, ?? ??? 0 ??)
    let baseNewStartTick = baseCurrentStartTick + offsetTicks;
    baseNewStartTick = Math.max(0, baseNewStartTick);
    
    // ????? ????? ??? Tick ???? ?? - ????? ?? PPQN ??
    if (ui.isQuantizeEnabled) {
      const ticksPerBeat = getPpqn(selectProject());
      baseNewStartTick = Math.round(baseNewStartTick / ticksPerBeat) * ticksPerBeat;
      baseNewStartTick = Math.max(0, baseNewStartTick);
    }
    
    // ?? ????? tick ??? (SMF ?? ??)
    const baseTickDelta = baseNewStartTick - partDragStart.partStartTick;
    
    // Y ??? ?? ??
    // ?? ? ?? ??? ??? ?? ???? ??
    let baseNewTrackId = partDragStart.partTrackId;
    
    if (!isTrackMovingMode) {
      // ?? ? ?? ??? ???: ?? ????? ??
      baseNewTrackId = partDragStart.partTrackId;
    } else if (contentRef.current) {
      // ? ?? ?? (Y??? ? ?? ?????, ?? ? ?? ?????, y??? ??? ??): Y ??? ?? ??
      contentRef.current.getBoundingClientRect();
      let accumulatedHeight = 0;
      const dragY = partDragStart.y + currentOffset.y;
      
      // dragY? ??? ??? ? ?? ???? ???
      if (dragY < 0 && tracks.length > 0) {
        baseNewTrackId = tracks[0].id;
      } else {
        let foundTrack = false;
        
        for (const track of tracks) {
          const trackHeight = trackHeights.get(track.id) || 70;
          const trackTop = accumulatedHeight;
          const trackBottom = accumulatedHeight + trackHeight;
          
          if (dragY >= trackTop && dragY < trackBottom) {
            baseNewTrackId = track.id;
            foundTrack = true;
            break;
          }
          accumulatedHeight += trackHeight;
        }
        
        // ??? ???? ?? ??? ???? ???
        if (!foundTrack && tracks.length > 0) {
          baseNewTrackId = tracks[tracks.length - 1].id;
        }
      }
    }
    
    // ?? ??? ??? (?? ??? ??)
    const baseOriginalTrackIndex = tracks.findIndex(t => t.id === partDragStart.partTrackId);
    const baseNewTrackIndex = tracks.findIndex(t => t.id === baseNewTrackId);
    const trackIndexDelta = baseNewTrackIndex - baseOriginalTrackIndex;
    
    // ? ??? ?? ?? ?? (tick ??)
    const partDropPositions = draggedPartsInfo.map(({ partId, originalStartTick, originalTrackId }) => {
      const newStartTick = originalStartTick + baseTickDelta;
      const originalTrackIndex = tracks.findIndex(t => t.id === originalTrackId);
      const newTrackIndex = originalTrackIndex + trackIndexDelta;
      const newTrackId = newTrackIndex >= 0 && newTrackIndex < tracks.length 
        ? tracks[newTrackIndex].id 
        : originalTrackId;
      
      return {
        partId,
        newStartTick,
        newTrackId,
      };
    });
    
    return {
      baseTickDelta,
      trackIndexDelta,
      baseNewTrackId,
      partDropPositions,
    };
  }, [isDraggingPart, partDragStart, partDragOffset, draggedPartId, draggedPartsInfo, pixelsPerSecond, tracks, trackHeights, isTrackMovingMode, ui.isQuantizeEnabled, bpm, timeSignature, ppqn, contentRef]);

  // ???? ??? ?? ???
  const handlePartMouseUp = useCallback(() => {
    if (!isDraggingPart || !partDragStart || !draggedPartId || draggedPartsInfo.length === 0) {
      return;
    }

    // MidiEditor? ????? ??? ????? ???? ?? ??? ??? (MidiEditor? ?? ? ???? ???? ??? ? ??)
    if (editingPartId) {
      ui.setIsDraggingPart(false);
      setDraggedPartId(null);
      setDraggedPartsInfo([]);
      setPartDragStart(null);
      partDragOffsetRef.current = { x: 0, y: 0 };
      setPartDragOffset({ x: 0, y: 0 });
      setIsTrackMovingMode(false);
      setIsCtrlPressedDuringDrag(false);
      ui.setDuplicateModeActive(false);
      setHasDraggedPart(false);
      return;
    }
    
    // ??? ???? ???? ???? ??? ????? ?????? ??
    if (!hasDraggedPart) {
      ui.setIsDraggingPart(false);
      setDraggedPartId(null);
      setDraggedPartsInfo([]);
      setPartDragStart(null);
      partDragOffsetRef.current = { x: 0, y: 0 };
      setPartDragOffset({ x: 0, y: 0 });
      setIsTrackMovingMode(false);
      setIsCtrlPressedDuringDrag(false);
      ui.setDuplicateModeActive(false);
      setHasDraggedPart(false);
      return;
    }
    
    // ?? ?? ?? (?? ?? ??)
    const dropPosition = calculateDropPosition();
    
    if (!dropPosition) {
      ui.setIsDraggingPart(false);
      setDraggedPartId(null);
      setDraggedPartsInfo([]);
      setPartDragStart(null);
      partDragOffsetRef.current = { x: 0, y: 0 };
      setPartDragOffset({ x: 0, y: 0 });
      setIsCtrlPressedDuringDrag(false);
      ui.setDuplicateModeActive(false);
      return;
    }

    const { partDropPositions } = dropPosition;
    
    // ????? ?? ?? ?? (tick ??)
    const partUpdates: Array<{ partId: string; updates: Partial<MidiPart> }> = [];
    
    partDropPositions.forEach(({ partId, newStartTick, newTrackId }) => {
      const originalPartInfo = draggedPartsInfo.find(info => info.partId === partId);
      const originalTrackId = originalPartInfo?.originalTrackId;
      
      // ?? ???? ?? ???? ???? ?? ???? ??? (??? ??)
      // ??? ??? ???? ??? ??? ???? ???? ???? ???
      if (!isCtrlPressedDuringDrag && newTrackId === originalTrackId) {
        // ?? ???? ??? ???? ??? ???? ??
        // ??? ??? ??? ??? ??
        const part = findMidiPartById(partId);
        if (part && part.startTick === newStartTick && part.trackId === newTrackId) {
          return; // ????? ??? ??
        }
      }
      
      partUpdates.push({
        partId,
        updates: {
          startTick: newStartTick,
          trackId: newTrackId,
        },
      });
    });
    
    // ???? ? ??? ???? ???? ??? ?? (???? ?? ???? ?)
    const historyEntries = preparePartLevelHistoryEntries(partUpdates);
    
    // ??? ??? ?? ?? (skipHistory=true? ????? ???? ??)
    if (isCtrlPressedDuringDrag) {
      // Ctrl ?? ?????? ?? (??? ?? ????? ???)
      // ?? ??? ??? ???? ???? ?? ?? cloneMultipleMidiParts ??
      // props? ?? timeSignature? ?? ???? ?? ???? ?? ? ?? ??
      const project = selectProject();
      const projectTimeSignature = timeSignature || getTimeSignature(project);
      const projectPpqn = ppqn || getPpqn(project);
      const clones = partDropPositions.map(({ partId, newStartTick, newTrackId }) => {
        // cloneMultipleMidiParts? measureStart? ???, ????? tick?? ???
        // tick? measure? ???? ?? (?? ???)
        const { measureStart } = ticksToMeasurePure(newStartTick, 0, projectTimeSignature, projectPpqn);
        return { partId, newMeasureStart: measureStart, newTrackId };
      });
      
      const newPartIds = cloneMultipleMidiParts(clones);
      
      if (newPartIds.length > 0) {
        ui.setSelectedClipIds(new Set(newPartIds));
        // ??? flash ??
        ui.setDuplicateFlashActive(true);
        setTimeout(() => {
          ui.setDuplicateFlashActive(false);
        }, 200);
      }
      // ??? ????? ???? ????? ?? ?? ???
    } else {
      // ?? ??: ?? ???? (????? ??? ??)
      if (partUpdates.length > 0) {
        updateMultipleMidiParts(partUpdates, true); // skipHistory=true
      }
      
      // ??? ???? ?? (???? ???)
      // ?? ???? ??? ??
      if (pendingUpdateTimerRef.current !== null) {
        window.clearTimeout(pendingUpdateTimerRef.current);
        pendingUpdateTimerRef.current = null;
      }
      
      // ???? ???? ref? ??
      pendingHistoryEntriesRef.current = historyEntries;
      isHistoryFlushedRef.current = false;
      
      // 300ms ?? ???? ?? (???? ?? ??)
      pendingUpdateTimerRef.current = window.setTimeout(() => {
        pendingUpdateTimerRef.current = null;
        
        // ????? ?? ?????? ?? ?? ??
        if (!isHistoryFlushedRef.current && pendingHistoryEntriesRef.current) {
          addPartLevelHistoryEntry({
            type: 'updateMultipleParts',
            updates: pendingHistoryEntriesRef.current
          });
          pendingHistoryEntriesRef.current = null;
        }
      }, 300);
    }
    
    // ?? ?? ??? (UI ??? ??)
    ui.setIsDraggingPart(false);
    setDraggedPartId(null);
    setDraggedPartsInfo([]);
    setPartDragStart(null);
    setPartDragOffset({ x: 0, y: 0 });
    setIsTrackMovingMode(false);
    setIsCtrlPressedDuringDrag(false);
    dragOriginRef.current = null;
    ui.setDuplicateModeActive(false);
    setHasDraggedPart(false);
  }, [isDraggingPart, partDragStart, partDragOffset, draggedPartId, draggedPartsInfo, hasDraggedPart, isCtrlPressedDuringDrag, ui, editingPartId, calculateDropPosition]);

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      // ??? ?? ??? ?
      if (isDraggingPlayhead && contentRef.current) {
        const rect = contentRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const newTime = Math.max(0, (x / pixelsPerSecond) + startTime);
        ui.setCurrentPlaybackTime(newTime);
        return;
      }
      
      if (isDragging && dragStart && dragCurrent) {
        const rect = contentRef.current?.getBoundingClientRect();
        if (!rect) return;
        
        const x = e.clientX - rect.left;
        setDragCurrent({ x, y: dragCurrent.y });
      }
      
      // ???? ?
      if (isSelectingClips && selectionStart && contentRef.current) {
        const rect = contentRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        setSelectionEnd({ x, y });
        
        // ?? ?? ?? ?? ??
        const selectRect = {
          left: Math.min(selectionStart.x, x),
          right: Math.max(selectionStart.x, x),
          top: Math.min(selectionStart.y, y),
          bottom: Math.max(selectionStart.y, y),
        };
        
        // ?? ???? ??? ????
        const project = selectProject();
        const currentTracks = project.tracks;
        
        const selectedIds = new Set<string>();
        let accumulatedHeight = 0;
        currentTracks.forEach(track => {
          const trackHeight = trackHeights.get(track.id) || 70;
          const trackTop = accumulatedHeight;
          const trackBottom = accumulatedHeight + trackHeight;
          
          // ??? ?? ??? ???? ??
          if (selectRect.bottom >= trackTop && selectRect.top <= trackBottom) {
            // ???? ???? ??? ?? ??
            const trackParts = findMidiPartsByTrackId(track.id);
            trackParts.forEach(part => {
                // Tick ?? ?? ?? ?? ?? (SMF ?? ??)
                // props? ?? timeSignature? ?? ???? ?? ???? ?? ? ?? ??
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
                const partX = partStartTime * pixelsPerSecond;
                const partRight = partX + partDuration * pixelsPerSecond;
                
                // ????? ?? ??? ???? ??
                if (partRight >= selectRect.left && partX <= selectRect.right) {
                  selectedIds.add(part.id);
                }
              });
          }
          accumulatedHeight += trackHeight;
        });
        
        ui.setSelectedClipIds(selectedIds);
      }
      
      // ?? ???? ? (????)
      if (isResizingPart && resizePartId && resizeStart && resizeSide && contentRef.current) {
        const rect = contentRef.current.getBoundingClientRect();
        if (!rect) return;
        
        const x = e.clientX - rect.left;
        if (!resizePartId) return;
        const part = findMidiPartById(resizePartId);
        if (!part) return;
        
        // Tick ?? ?? ???? (SMF ?? ??)
        // ?? ??? Tick ?? (?? tick??? ?? ??)
        const originalPartStartTick = resizeStart.originalStartTick;
        const originalPartDurationTicks = resizeStart.originalDurationTicks;
        const originalPartEndTick = originalPartStartTick + originalPartDurationTicks;
        
        if (resizeSide === 'right') {
          // ??? ? ????: ?? ??? ?? (Tick ??)
          // props? ?? timeSignature? ?? ???? ?? ???? ?? ? ?? ??
          const project = getProject();
          const mouseTime = (x / pixelsPerSecond) + startTime;
          const projectTimeSignature = timeSignature || getTimeSignature(project);
          const projectPpqn = ppqn || getPpqn(project);
          const tempoMap = project.timing?.tempoMap ?? [];
          const { startTick: mouseTick } = secondsToTicksPure(
            mouseTime,
            0,
            tempoMap,
            projectTimeSignature,
            projectPpqn
          );
          
          // ??? ?? (Tick ??)
          let newDurationTicks = Math.max(MIDI_CONSTANTS.MIN_NOTE_DURATION_TICKS, mouseTick - originalPartStartTick);
          
          // ???? ?? (Tick ??) - ????? ?? PPQN ??
          if (ui.isQuantizeEnabled) {
            const ticksPerBeat = getPpqn(selectProject());
            const newEndTick = originalPartStartTick + newDurationTicks;
            const snappedEndTick = Math.round(newEndTick / ticksPerBeat) * ticksPerBeat;
            newDurationTicks = Math.max(MIDI_CONSTANTS.MIN_NOTE_DURATION_TICKS, snappedEndTick - originalPartStartTick);
          }
          
          // ?? ?? ?? ? ???? ???? (tick ??)
          if (newDurationTicks >= MIDI_CONSTANTS.MIN_NOTE_DURATION_TICKS) {
            setResizePreview({
              startTick: originalPartStartTick,
              durationTicks: newDurationTicks
            });
          }
        } else {
          // ?? ? ????: ?? ??? ?? ?? (Tick ??)
          // props? ?? timeSignature? ?? ???? ?? ???? ?? ? ?? ??
          const project = getProject();
          const mouseTime = (x / pixelsPerSecond) + startTime;
          const projectTimeSignature = timeSignature || getTimeSignature(project);
          const projectPpqn = ppqn || getPpqn(project);
          const tempoMap = project.timing?.tempoMap ?? [];
          const { startTick: mouseTick } = secondsToTicksPure(
            mouseTime,
            0,
            tempoMap,
            projectTimeSignature,
            projectPpqn
          );
          
          // ??? ?? ?? (Tick ??)
          let newStartTick = Math.max(0, mouseTick);
          let newDurationTicks = originalPartEndTick - newStartTick;
          
          // ???? ?? (Tick ??) - ????? ?? PPQN ??
          if (ui.isQuantizeEnabled) {
            const ticksPerBeat = getPpqn(selectProject());
            newStartTick = Math.round(newStartTick / ticksPerBeat) * ticksPerBeat;
            newStartTick = Math.max(0, newStartTick);
            newDurationTicks = originalPartEndTick - newStartTick;
          }
          
          // ?? ?? ?? ? ???? ???? (tick ??)
          if (newDurationTicks >= MIDI_CONSTANTS.MIN_NOTE_DURATION_TICKS && newStartTick >= 0) {
            setResizePreview({
              startTick: newStartTick,
              durationTicks: newDurationTicks
            });
          }
        }
      }
      
      // ?? ??? ?
      if (isDraggingPart && partDragStart) {
        const rect = contentRef.current?.getBoundingClientRect();
        if (!rect) return;
        
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        let offsetX = x - partDragStart.x;
        const offsetY = y - partDragStart.y;
        
        // ????? ????? ??? ??? ??? ??
        if (ui.isQuantizeEnabled && draggedPartId) {
          const basePart = findMidiPartById(draggedPartId);
          if (basePart) {
            const project = getProject();
            const beatUnit = timeSignature[1];
            const noteValueRatio = 4 / beatUnit;
            const secondsPerBeat = (60 / bpm) * noteValueRatio;
            
            // ?? startTime ?? (tick ??)
            // props? ?? timeSignature? ?? ???? ?? ???? ?? ? ?? ??
            const projectTimeSignature = timeSignature || getTimeSignature(project);
            const projectPpqn = ppqn || getPpqn(project);
            const tempoMap = project.timing?.tempoMap ?? [];
            const { startTime: currentStartTime } = ticksToSecondsPure(
              partDragStart.partStartTick,
              basePart.durationTicks,
              tempoMap,
              projectTimeSignature,
              projectPpqn
            );
            
            // ?? startTime + offset? ?? ??? ??
            const rawStartTime = currentStartTime + offsetX / pixelsPerSecond;
            const snappedStartTime = Math.round(rawStartTime / secondsPerBeat) * secondsPerBeat;
            
            // ??? ??? ?? ?? ????? ??
            offsetX = (snappedStartTime - currentStartTime) * pixelsPerSecond;
          }
        }
        
        // ?? ?? ?? ????? ???? ?? (5px ??)
        if (Math.abs(offsetX) > 5 || Math.abs(offsetY) > 5) {
          setHasDraggedPart(true);
        }
        
        // Y ?? ??? 30px ???? ?? ? ?? ?? ???
        const TRACK_MOVE_THRESHOLD = 30;
        if (Math.abs(offsetY) > TRACK_MOVE_THRESHOLD) {
          setIsTrackMovingMode(true);
        }
        
        // ?? ? ?? ??? ??? Y ???? 0?? ?? (??????? ???? ??)
        const finalOffsetY = isTrackMovingMode ? offsetY : 0;
        
        const newOffset = {
          x: offsetX,
          y: finalOffsetY,
        };
        
        // ref? ?? ?? (calculateDropPosition?? ?? ?? ???? ??)
        partDragOffsetRef.current = newOffset;
        setPartDragOffset(newOffset);
      }
    };

    const handleGlobalMouseUp = () => {
      if (isDraggingPlayhead) {
        setIsDraggingPlayhead(false);
      }
      if (isDragging) {
        handleMouseUp();
      }
      if (isDraggingPart) {
        handlePartMouseUp();
      }
      if (isSelectingClips) {
        // merge ??? ? ??? ???? merge
        if (ui.cursorMode === 'mergeByKey4' && selectionStart && selectionEnd) {
          const selectedIds = Array.from(ui.selectedClipIds);
          if (selectedIds.length >= 2) {
            // ?? ??? ?? ???? merge ??
            const parts = selectedIds.map(id => findMidiPartById(id)).filter((p): p is MidiPart => p !== undefined);
            if (parts.length >= 2) {
              // ?? ??? ?? ??? ??? ??
              const firstTrackId = parts[0].trackId;
              const allSameTrack = parts.every(p => p.trackId === firstTrackId);
              if (allSameTrack) {
                const result = mergeMidiParts(selectedIds);
                if (result) {
                  ui.setSelectedClipIds(new Set([result.mergedPartId]));
                }
              }
            }
          }
        }
        
        setIsSelectingClips(false);
        setSelectionStart(null);
        setSelectionEnd(null);
        
        // ????? ?? ?????? ?? (?? click ??? ???)
        justFinishedMarqueeSelectionRef.current = true;
        // ?? ????? ???? ?? (?? click ???? ???? ?? ??? ??)
        setTimeout(() => {
          justFinishedMarqueeSelectionRef.current = false;
        }, 100);
      }
      // ???? ?? - ????? ?? ??
      // MidiEditor? ????? ???? ??? ???? ?? (MidiEditor? ?? ? ???? ???? ??? ? ??)
      if (isResizingPart && resizePartId && resizePreview && resizeStart && resizeSide && !editingPartId) {
        const part = findMidiPartById(resizePartId);
        if (part) {
          if (resizeSide === 'right') {
            // ??? ? ????: ?? ??? ??
            updateMidiPart(resizePartId, {
              durationTicks: resizePreview.durationTicks
            });
          } else {
            // ?? ? ????: ?? ??? ?? ??
            // ??? ?? ?? ??? ? ?? ???? ?? ??? ??? ????? ??
            const newStartTick = resizePreview.startTick;
            
            // ??? ?? ??? ?? (??? ???? ?? ?? ??? ???? ??? ?? ?)
            const adjustedNotes = part.notes.map((note) => {
              const noteWithTicks = note.startTick !== undefined && note.durationTicks !== undefined
                ? note
                : { ...note, startTick: 0, durationTicks: 0 };
              
              // ??? ?? ?? ??
              // NOTE: note.startTick? ?? "?? part.startTick ?? ???"?? ???? ?.
              // (?? ?????? ?? startTick? ???? ??? ?? ??? ????? ???)
              const currentPartStartTick = part.startTick;
              const noteRelativeStartTick = noteWithTicks.startTick;
              const absoluteNoteStartTick = currentPartStartTick + noteRelativeStartTick;

              // IMPORTANT: ?? ?????? ??? "???? ?? ???"??,
              // ?? ??? ??? ? ??? ?? ??? ??? ? ??.
              // ??? note.durationTicks? ?? ??? ??, startTick? ? ?? ???? ?????.
              const newRelativeStartTick = absoluteNoteStartTick - newStartTick;

              // ??? ? ?? ?? ??? ????? ???? ??? ??: startTick? ??? ?? duration? ??
              // (?? newRelativeStartTick? ??? ????? ?? ?? ???)

              return {
                ...noteWithTicks,
                startTick: newRelativeStartTick,
                durationTicks: noteWithTicks.durationTicks,
              };
            });
            
            updateMidiPart(resizePartId, {
              startTick: resizePreview.startTick,
              durationTicks: resizePreview.durationTicks,
              notes: adjustedNotes,
            });
          }
        }
        
        setIsResizingPart(false);
        setResizePartId(null);
        setResizeSide(null);
        setResizeStart(null);
        setResizePreview(null);
      } else if (isResizingPart && editingPartId) {
        // MidiEditor? ???? ? ???? ??? ??? (????? ???? ??)
        setIsResizingPart(false);
        setResizePartId(null);
        setResizeSide(null);
        setResizeStart(null);
        setResizePreview(null);
      }
    };

    if (isDragging || isDraggingPart || isSelectingClips || isDraggingPlayhead || isResizingPart) {
      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('mouseup', handleGlobalMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isDragging, dragStart, dragCurrent, pixelsPerSecond, isDraggingPart, partDragStart, draggedPartId, isTrackMovingMode, handlePartMouseUp, ui.isQuantizeEnabled, bpm, timeSignature, isSelectingClips, selectionStart, trackHeights, ui, isDraggingPlayhead, startTime, isResizingPart, resizePartId, resizeStart, resizeSide, resizePreview, editingPartId]);

  // ???? ??? ?? ???
  const handlePartMouseDown = useCallback((partId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // ???? ??: ??? ?????? 500ms ??? ?????? ???? ??? ???? ??
    const now = Date.now();
    const timeSinceLastClick = now - lastClickTimeRef.current;
    if (timeSinceLastClick < 500) {
      // ??????? ??? ???? ??
      return;
    }
    lastClickTimeRef.current = now;

    // Ctrl ? ?? ??? (??? ?? ?)
    setIsCtrlPressedDuringDrag(false);

    const rect = contentRef.current?.getBoundingClientRect();
    if (!rect) return;

    const part = findMidiPartById(partId);
    if (!part) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Tick ?? ?? ?? ??? ?? ?? (SMF ?? ??)
    // props? ?? timeSignature? ?? ???? ?? ???? ?? ? ?? ??
    const project = getProject();
    const partStartTick = part.startTick;
    const partDurationTicks = part.durationTicks;
    const projectTimeSignature = timeSignature || getTimeSignature(project);
    const projectPpqn = ppqn || getPpqn(project);
    const tempoMap = project.timing?.tempoMap ?? [];
    const { startTime: partStartTime, duration: partDuration } = ticksToSecondsPure(
      partStartTick,
      partDurationTicks,
      tempoMap,
      projectTimeSignature,
      projectPpqn
    );
    const partX = partStartTime * pixelsPerSecond;
    const partWidth = partDuration * pixelsPerSecond;
    const partRight = partX + partWidth;
    
    // ???? ?? ?? ?? (?? ??? ??, ?? ??? ???? ?? ??, ?? ???)
    const isLeftResize = x >= partX - RESIZE_HANDLE_WIDTH_PX / 2 && x <= partX + RESIZE_HANDLE_WIDTH_PX / 2;
    const isRightResize = x >= partRight - RESIZE_HANDLE_WIDTH_PX / 2 && x <= partRight + RESIZE_HANDLE_WIDTH_PX / 2;
    
    // Split ?? + ?? = Split
    if (e.altKey || isSplitMode(ui.cursorMode)) {
      e.preventDefault();
      
      // ??? ??? ???? ??? measure ??
      const relativeSplitMeasure = calculateSplitMeasure(
        x,
        part,
        partX,
        partStartTime,
        partDuration,
        pixelsPerSecond,
        projectTimeSignature,
        projectPpqn,
        tempoMap,
        ui.isQuantizeEnabled,
        bpm ?? getBpm(project)
      );
      
      if (relativeSplitMeasure !== null) {
        splitMidiPart(partId, relativeSplitMeasure);
      }
      return;
    }
    
    // ???? ??
    if (isLeftResize || isRightResize) {
      e.preventDefault();
      setIsResizingPart(true);
      setResizePartId(partId);
      setResizeSide(isLeftResize ? 'left' : 'right');
      setResizeStart({
        x,
        originalDurationTicks: part.durationTicks,
        originalStartTick: part.startTick
      });
      return;
    }
    
    // Shift ?? Ctrl ?? ??? ?? ????? ??? ??
    // ??? ?? ?????? ?? ?? (tick ??)
    const selectedPartsInfo: Array<{ partId: string; originalStartTick: number; originalTrackId: string }> = [];
    
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      // ?? ?? ??: ?? ??? ??? ??
      Array.from(ui.selectedClipIds).forEach(selectedPartId => {
        const selectedPart = findMidiPartById(selectedPartId);
        if (selectedPart) {
          selectedPartsInfo.push({
            partId: selectedPartId,
            originalStartTick: selectedPart.startTick,
            originalTrackId: selectedPart.trackId,
          });
        }
      });
      
      // ?? ??? ?? ??? ??? ??
      if (!ui.selectedClipIds.has(partId)) {
        selectedPartsInfo.push({
          partId,
          originalStartTick: part.startTick,
          originalTrackId: part.trackId,
        });
      }
    } else {
      // Shift/Ctrl/Meta ?? ?? ?:
      // - ?? ??? ???? ??, ?? ??? ??? ??? ?? ? ???? ? ?? ??? ??? ???
      // - ?? ??? ??? ???? ?? ???? ? ? ??? ???? ???
      if (ui.selectedClipIds.size > 0 && ui.selectedClipIds.has(partId)) {
        // ?? ?? ??? ???? ??? ?? ? ??? ?? ? ?? ??? ??? ???
        Array.from(ui.selectedClipIds).forEach(selectedPartId => {
          const selectedPart = findMidiPartById(selectedPartId);
          if (selectedPart) {
            selectedPartsInfo.push({
              partId: selectedPartId,
              originalStartTick: selectedPart.startTick,
              originalTrackId: selectedPart.trackId,
            });
          }
        });
      } else {
        // ???? ?? ??? ?? ? ? ??? ???? ???
        selectedPartsInfo.push({
          partId,
          originalStartTick: part.startTick,
          originalTrackId: part.trackId,
        });
        ui.setSelectedClipIds(new Set([partId]));
      }
    }
    
    e.preventDefault();
    
    ui.setIsDraggingPart(true);
    
    // ??? ?? ?? X ?? ?? (startTick? ???? ?? ? ??? ??)
    // props? ?? timeSignature? ?? ???? ?? ???? ?? ? ?? ??
    const { startTime: dragPartStartTime } = ticksToSecondsPure(
      part.startTick,
      part.durationTicks,
      tempoMap,
      projectTimeSignature,
      projectPpqn
    );
    const dragPartStartX = (dragPartStartTime - (startTime || 0)) * pixelsPerSecond;
    
    // ??? ?? ??? ?? ?? ??? ??? ????? ??
    const clickOffsetX = x - dragPartStartX;
    
    setDraggedPartId(partId); // ?? ???? (??? ??? ??)
    setDraggedPartsInfo(selectedPartsInfo); // ?? ????? ?????
    setHasDraggedPart(false); // ??? ?? ? ???
    setIsTrackMovingMode(false); // ?? ? ?? ?? ???
    setPartDragStart({
      x, // ??? ?? ?? ?? (???? ??? ??)
      y,
      partStartTick: part.startTick,
      partTrackId: part.trackId,
      clickOffsetX, // ?? ??? ?? (?? ?? ?? ? ???)
    });
    setPartDragOffset({ x: 0, y: 0 }); // ?? ???? 0
  }, [ui, timeSignature, ppqn, pixelsPerSecond, bpm, startTime, contentRef]);

  // ?? ?? ??? (?? ?? - ???)
  const handlePartClick = useCallback((partId: string, e: React.MouseEvent) => {
    // ???? ????? ?? ??
    if (hasDraggedPart || isDraggingPart) {
      return;
    }
    
    e.stopPropagation();
    
    // Ctrl/Cmd ?? ??? ??? ?? ?? (??)
    if (e.ctrlKey || e.metaKey) {
      ui.toggleSelectedClipId(partId);
    } else if (e.shiftKey) {
      // Shift ?? ??? ??? ?? ?? (?? ?? ?? ?)
      ui.toggleSelectedClipId(partId);
    } else {
      // ?? ??
      ui.setSelectedClipIds(new Set([partId]));
      
      // MIDI ?? ?? ? ?? ??? ??? ??? (???? ??? ??? ????)
      const part = findMidiPartById(partId);
      if (part && onTrackSelect && selectedTrackId !== part.trackId) {
        onTrackSelect(part.trackId);
      }
    }
  }, [ui, hasDraggedPart, isDraggingPart, onTrackSelect, selectedTrackId]);
  
  // ???? ???? ??? (??????? ?? ??)
  const handlePartDoubleClick = useCallback((partId: string, e: React.MouseEvent) => {
    // ?? ??? null? ??? ?? ???? ?? ??
    if (ui.cursorMode !== null) {
      return;
    }
    
    // ??? ???? ??? ???? ????? ???? ??
    if (isDraggingPart || hasDraggedPart) {
      return;
    }

    e.stopPropagation();
    e.preventDefault();
    
    // ??? ???? ?? ??? ?? (?????? MidiEditor? ? ? ? ?? ??? ????? ???? ???)
    if (pendingUpdateTimerRef.current !== null) {
      window.clearTimeout(pendingUpdateTimerRef.current);
      pendingUpdateTimerRef.current = null;
      pendingHistoryEntriesRef.current = null; // ???? ???? ???
      isHistoryFlushedRef.current = false;
    }

    // MidiEditor? ? ? ?? ??? ? ???? ?? ?? ??? (???? ?? ??)
    if (isResizingPart) {
      setIsResizingPart(false);
      setResizePartId(null);
      setResizeSide(null);
      setResizeStart(null);
      setResizePreview(null);
    }

    // ??? ??? ??? ???
    if (isDraggingPart) {
      ui.setIsDraggingPart(false);
      setDraggedPartId(null);
      setDraggedPartsInfo([]);
      setPartDragStart(null);
      partDragOffsetRef.current = { x: 0, y: 0 };
      setPartDragOffset({ x: 0, y: 0 });
      setIsTrackMovingMode(false);
      setIsCtrlPressedDuringDrag(false);
      setHasDraggedPart(false);
    }

    setEditingPartId(partId);
    ui.setEditingPartId(partId);
  }, [isDraggingPart, hasDraggedPart, isResizingPart, ui]);

  // ??? ????? ?? ???? ?? ?? (undo ?? ? ??)
  useEffect(() => {
    const flushPendingHistory = () => {
      if (pendingUpdateTimerRef.current !== null && pendingHistoryEntriesRef.current && !isHistoryFlushedRef.current) {
        // ??? ??
        window.clearTimeout(pendingUpdateTimerRef.current);
        pendingUpdateTimerRef.current = null;
        
        // ???? ?? ??
        addPartLevelHistoryEntry({
          type: 'updateMultipleParts',
          updates: pendingHistoryEntriesRef.current
        });
        
        pendingHistoryEntriesRef.current = null;
        isHistoryFlushedRef.current = true;
      }
    };
    
    // ?? ??
    setFlushPendingHistoryCallback(flushPendingHistory);
    
    // ???? ???? ? ?? ??
    return () => {
      setFlushPendingHistoryCallback(null);
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.shiftKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        const bottomScrollbar = document.getElementById('timeline-scrollbar');
        if (bottomScrollbar) {
          const scrollDelta = e.deltaY > 0 ? 50 : -50;
          bottomScrollbar.scrollLeft += scrollDelta;
        }
        return;
      }

      if (e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        const min = 10;
        const max = 200;
        const delta = e.deltaY > 0 ? -5 : 5;
        const newValue = Math.max(min, Math.min(max, pixelsPerSecond + delta));
        ui.setPixelsPerSecond(newValue);
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [pixelsPerSecond, ui]);

  return (
    <>
      {editingPartId && (() => {
        if (typeof window !== 'undefined' && document.body) {
          return createPortal(
            <MidiEditor
              partId={editingPartId}
              onClose={() => {
                setEditingPartId(null);
                ui.setEditingPartId(null);
                // pub-sub? ???? ??????? forceUpdate ???
              }}
              bpm={bpm}
              timeSignature={timeSignature}
              pixelsPerSecond={pixelsPerSecond}
            />,
            document.body
          );
        }
        return null;
      })()}
    <div 
      className={styles.eventDisplay} 
      ref={containerRef}
    >
      <div 
        ref={contentRef} 
        className={styles.eventContent} 
        style={{ width: `${totalWidth}px`, minWidth: '100%' }}
        onMouseMove={handleMouseMove}
        onMouseDown={handleContentMouseDown}
        onClick={handleContentClick}
      >
        {/* Step 10: ? ??? - TimelineView ?????? ?? ??? ?? */}
        <TimelineView
          exportRangeStart={ui.exportRangeStart}
          exportRangeEnd={ui.exportRangeEnd}
          startTime={startTime}
          pixelsPerSecond={pixelsPerSecond}
          totalWidth={totalWidth}
          isRecording={isRecording}
          onPlayheadMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDraggingPlayhead(true);
          }}
          tracks={tracks}
          trackHeights={trackHeights}
          selectedTrackId={selectedTrackId}
          measureMarkers={measureMarkers}
          onTrackMouseDown={handleMouseDown}
          onTrackClick={(e) => {
            e.stopPropagation();
          }}
          // ???? ??? ? ?? props
          bpm={bpm}
          timeSignature={timeSignature}
          ppqn={ppqn}
          isDraggingPart={isDraggingPart}
          draggedPartsInfo={draggedPartsInfo}
          partDragOffset={partDragOffset}
          isResizingPart={isResizingPart}
          resizePartId={resizePartId}
          resizePreview={resizePreview}
          resizeStart={resizeStart}
          resizeSide={resizeSide}
          isTrackMovingMode={isTrackMovingMode}
          partDragStart={partDragStart}
          isCtrlPressedDuringDrag={isCtrlPressedDuringDrag}
          selectedClipIds={ui.selectedClipIds}
          hoveredPartId={hoveredPartId}
          cursorMode={ui.cursorMode}
          isQuantizeEnabled={ui.isQuantizeEnabled}
          contentRef={contentRef}
          onPartClick={handlePartClick}
          onPartDoubleClick={handlePartDoubleClick}
          onPartMouseDown={handlePartMouseDown}
          onPartMouseEnter={(partId, e) => {
            ui.setHoveredPartId(partId);
            // split ??? ? ?? ???? ? ??
            if (isSplitMode(ui.cursorMode)) {
              const rect = contentRef.current?.getBoundingClientRect();
              if (rect) {
                const x = e.clientX - rect.left;
                const part = findMidiPartById(partId);
                if (part) {
                  // ??? ??? ???? ??? ???? ??
                  const project = getProject();
                  const projectTimeSignature = timeSignature || getTimeSignature(project);
                  const projectPpqn = ppqn || getPpqn(project);
                  const tempoMap = project.timing?.tempoMap ?? [];
                  
                  const previewX = calculateSplitPreviewX({
                    mouseX: x,
                    part,
                    pixelsPerSecond,
                    timeSignature: projectTimeSignature,
                    ppqn: projectPpqn,
                    tempoMap,
                    isQuantizeEnabled: ui.isQuantizeEnabled,
                    bpm: bpm ?? getBpm(project)
                  });
                  
                  if (previewX !== null) {
                    setSplitPreviewX(previewX);
                    setSplitPreviewPartId(partId);
                  } else {
                    setSplitPreviewX(null);
                    setSplitPreviewPartId(null);
                  }
                }
              }
            }
          }}
          onPartMouseLeave={(_partId) => {
            ui.setHoveredPartId(null);
            setSplitPreviewX(null);
            setSplitPreviewPartId(null);
          }}
          onPartMouseMove={(partId, e) => {
            if (isSplitMode(ui.cursorMode) && hoveredPartId === partId) {
              const rect = contentRef.current?.getBoundingClientRect();
              if (rect) {
                const x = e.clientX - rect.left;
                const part = findMidiPartById(partId);
                if (part) {
                  // ??? ??? ???? ??? ???? ??
                  const project = getProject();
                  const projectTimeSignature = timeSignature || getTimeSignature(project);
                  const projectPpqn = ppqn || getPpqn(project);
                  const tempoMap = project.timing?.tempoMap ?? [];
                  
                  const previewX = calculateSplitPreviewX({
                    mouseX: x,
                    part,
                    pixelsPerSecond,
                    timeSignature: projectTimeSignature,
                    ppqn: projectPpqn,
                    tempoMap,
                    isQuantizeEnabled: ui.isQuantizeEnabled,
                    bpm: bpm ?? getBpm(project)
                  });
                  
                  if (previewX !== null) {
                    setSplitPreviewX(previewX);
                    setSplitPreviewPartId(partId);
                  } else {
                    setSplitPreviewX(null);
                    setSplitPreviewPartId(null);
                  }
                }
              }
            }
          }}
          onSetHoveredPartId={ui.setHoveredPartId}
          onSetSplitPreviewX={setSplitPreviewX}
          onSetSplitPreviewPartId={setSplitPreviewPartId}
          splitPreviewX={splitPreviewX}
          splitPreviewPartId={splitPreviewPartId}
          calculateDropPosition={calculateDropPosition}
          isDragging={isDragging}
          dragStart={dragStart}
          dragCurrent={dragCurrent}
        />

        {/* Step 9.5: ???? ?? - eventContent ???? ????? ?? ??? ?? ??? ?? ?? */}
        {isSelectingClips && selectionStart && selectionEnd && (() => {
          const selectRect = {
            left: Math.min(selectionStart.x, selectionEnd.x),
            right: Math.max(selectionStart.x, selectionEnd.x),
            top: Math.min(selectionStart.y, selectionEnd.y),
            bottom: Math.max(selectionStart.y, selectionEnd.y),
          };
          
          return (
            <div
              key="selection-rect"
              className={styles.selectionRect}
              style={{
                position: 'absolute',
                left: `${selectRect.left}px`,
                top: `${selectRect.top}px`,
                width: `${selectRect.right - selectRect.left}px`,
                height: `${selectRect.bottom - selectRect.top}px`,
              }}
            />
          );
        })()}

      </div>
    </div>
    </>
  );
};

export default EventDisplay;
