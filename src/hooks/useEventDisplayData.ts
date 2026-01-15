import { useState, useEffect, useMemo } from 'react';
import { getProject, subscribeToProjectChanges } from '../store/projectStore';
import type { Project, Track, MidiPart } from '../types/project';

/**
 * useEventDisplayData 훅 Props
 * Phase 8: EventDisplay 데이터 레이어 분리
 */
export interface UseEventDisplayDataProps {
  // 현재는 props 없음 (프로젝트 데이터는 전역 store에서 가져옴)
}

/**
 * useEventDisplayData 훅 반환 타입
 */
export interface UseEventDisplayDataReturn {
  // Data
  project: Project;
  tracks: Track[];
  midiParts: MidiPart[];
  
  // Update trigger
  updateCounter: number;
}

/**
 * EventDisplay의 데이터 처리 로직을 관리하는 훅
 * Phase 8: EventDisplay 데이터 레이어 분리
 */
export const useEventDisplayData = ({}: UseEventDisplayDataProps = {}): UseEventDisplayDataReturn => {
  
  // 프로젝트 변경 감지를 위한 카운터
  const [updateCounter, setUpdateCounter] = useState(0);
  
  // pub-sub 패턴을 사용하여 프로젝트 변경 감지
  useEffect(() => {
    const unsubscribe = subscribeToProjectChanges((event) => {
      // track, midiPart, timeSignature 변경 시 리렌더링
      if (event.type === 'track' || event.type === 'midiPart' || event.type === 'timeSignature' || event.type === 'bpm') {
        setUpdateCounter(prev => prev + 1);
      }
    });
    
    // 구독 후에도 한 번 더 확인 (비동기 로드 대응)
    const timeoutId = setTimeout(() => {
      const projectAfterDelay = getProject();
      if (projectAfterDelay.midiParts.length > 0 || projectAfterDelay.tracks.length > 0) {
        setUpdateCounter(prev => prev + 1);
      }
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      unsubscribe();
    };
  }, []);

  // 항상 최신 tracks와 midiParts를 읽기 위해 getProject()를 사용 (메모이제이션)
  const project = useMemo(() => getProject(), [updateCounter]);
  const tracks = useMemo(() => project.tracks, [project.tracks]);
  const midiParts = useMemo(() => project.midiParts, [project.midiParts]);

  return {
    project,
    tracks,
    midiParts,
    updateCounter,
  };
};

