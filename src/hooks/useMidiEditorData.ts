import { useState, useEffect, useMemo, useCallback } from 'react';
import { getProject, getMidiPartNotes, subscribeToProjectChanges } from '../store/projectStore';
import type { MidiNote, MidiPart } from '../types/project';
import { ticksToSecondsPure, getTimeSignature, getPpqn } from '../utils/midiTickUtils';

/**
 * Sustain 범위 타입
 */
export interface SustainRange {
  startTick: number;
  endTick: number;
}

/**
 * 노트 타이밍 정보
 */
export interface NoteTiming {
  startTime: number;
  duration: number;
}

/**
 * 뷰포트 내 노트 정보
 */
export interface VisibleNote {
  note: MidiNote;
  index: number;
  startTime: number;
  duration: number;
}

/**
 * MidiEditor 데이터 레이어 훅
 * Phase 7.2: 데이터 처리 로직 분리
 * 
 * MidiEditor의 데이터 처리 로직을 담당합니다:
 * - 노트 데이터 가져오기
 * - 프로젝트 변경 구독
 * - 파생된 데이터 계산 (sustain ranges, viewport notes 등)
 */
export const useMidiEditorData = (
  partId: string,
  options?: {
    /** 뷰포트 시작 시간 (초) */
    viewportStartTime?: number;
    /** 뷰포트 종료 시간 (초) */
    viewportEndTime?: number;
    /** BPM (노트 타이밍 계산용) */
    bpm?: number;
    /** 타임 시그니처 (노트 타이밍 계산용) */
    timeSignature?: [number, number];
  }
) => {
  const {
    viewportStartTime = 0,
    viewportEndTime = Infinity,
  } = options || {};

  // 프로젝트 변경 추적
  const [projectUpdateCounter, setProjectUpdateCounter] = useState(0);
  
  // 파트 정보 (메모이제이션)
  const part = useMemo<MidiPart | undefined>(() => {
    const currentProject = getProject();
    return currentProject.midiParts.find(p => p.id === partId);
  }, [partId, projectUpdateCounter]);

  // 노트 데이터
  const [partNotes, setPartNotes] = useState<MidiNote[]>(() => {
    return getMidiPartNotes(partId);
  });

  // 프로젝트 변경 구독
  useEffect(() => {
    const unsubscribe = subscribeToProjectChanges((event) => {
      if (event.type === 'midiPart' && event.partId === partId) {
        // 파트가 변경되었을 때 노트 데이터 업데이트
        const newNotes = getMidiPartNotes(partId);
        setPartNotes(newNotes);
        // 프로젝트 업데이트 카운터 증가 (part 재계산 트리거)
        setProjectUpdateCounter(prev => prev + 1);
      }
    });

    return unsubscribe;
  }, [partId]);

  // Sustain 범위 계산 (CC64 이벤트 기반)
  const sustainRanges = useMemo<SustainRange[]>(() => {
    if (!part?.controlChanges || part.controlChanges.length === 0) return [];
    
    const cc64 = part.controlChanges
      .filter(cc => cc.controller === 64 && Number.isFinite(cc.tick) && Number.isFinite(cc.value))
      .slice()
      .sort((a, b) => (a.tick - b.tick) || ((a.value ?? 0) - (b.value ?? 0)));

    const ranges: SustainRange[] = [];
    let activeStart: number | null = null;

    for (const cc of cc64) {
      const isDown = (cc.value ?? 0) >= 64;
      if (isDown) {
        if (activeStart === null) {
          activeStart = cc.tick;
        }
      } else if (activeStart !== null) {
        const endTick = Math.max(activeStart, cc.tick);
        ranges.push({ startTick: activeStart, endTick });
        activeStart = null;
      }
    }

    if (activeStart !== null) {
      const endTick = Math.max(activeStart, part.durationTicks ?? activeStart);
      ranges.push({ startTick: activeStart, endTick });
    }

    return ranges;
  }, [part?.controlChanges, part?.durationTicks]);

  // 노트 타이밍 계산 (각 노트의 시작 시간과 지속 시간)
  const noteTimings = useMemo<NoteTiming[]>(() => {
    const project = getProject();
    const timeSignature = getTimeSignature(project);
    const ppqn = getPpqn(project);
    const tempoMap = project.timing?.tempoMap ?? [];
    return partNotes.map((note) => {
      const { startTime, duration } = ticksToSecondsPure(
        note.startTick ?? 0,
        note.durationTicks ?? 0,
        tempoMap,
        timeSignature,
        ppqn
      );
      return { startTime, duration };
    });
  }, [partNotes]);

  // 뷰포트 내 노트 필터링 (overscan 포함)
  const visibleNotes = useMemo<VisibleNote[]>(() => {
    const VIEWPORT_OVERSCAN_SECONDS = 1;
    const start = Math.max(0, viewportStartTime - VIEWPORT_OVERSCAN_SECONDS);
    const end = viewportEndTime + VIEWPORT_OVERSCAN_SECONDS;
    
    const results: VisibleNote[] = [];
    for (let i = 0; i < partNotes.length; i++) {
      const timing = noteTimings[i];
      if (!timing) continue;
      
      const noteEndTime = timing.startTime + timing.duration;
      // 노트가 뷰포트와 겹치는지 확인
      if (noteEndTime >= start && timing.startTime <= end) {
        results.push({
          note: partNotes[i],
          index: i,
          startTime: timing.startTime,
          duration: timing.duration,
        });
      }
    }
    return results;
  }, [partNotes, noteTimings, viewportStartTime, viewportEndTime]);

  // 노트 데이터 강제 새로고침
  const refreshNotes = useCallback(() => {
    const freshNotes = getMidiPartNotes(partId);
    setPartNotes(freshNotes);
    setProjectUpdateCounter(prev => prev + 1);
  }, [partId]);

  // 파트의 duration 계산 (초 단위)
  const partDuration = useMemo(() => {
    if (!part) return 0;
    const project = getProject();
    const timeSignature = getTimeSignature(project);
    const ppqn = getPpqn(project);
    const tempoMap = project.timing?.tempoMap ?? [];
    return ticksToSecondsPure(0, part.durationTicks, tempoMap, timeSignature, ppqn).duration;
  }, [part]);

  return {
    // 파트 정보
    part,
    partDuration,
    
    // 노트 데이터
    partNotes,
    refreshNotes,
    
    // 파생된 데이터
    sustainRanges,
    noteTimings,
    visibleNotes,
    
    // 프로젝트 업데이트 카운터 (외부에서 강제 업데이트 시 사용)
    projectUpdateCounter,
  };
};

