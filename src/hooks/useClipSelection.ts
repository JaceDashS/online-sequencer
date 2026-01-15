import { useCallback } from 'react';
import { useUIState } from '../store/uiStore';
import { getProject } from '../store/projectStore';
import type { MidiPart } from '../types/project';

/**
 * 클립 선택을 관리하는 훅
 * 
 * @remarks
 * - Phase 6.3: 선택 로직을 훅으로 분리하여 컴포넌트 간 중복 방지
 * - 클립 선택, 다중 선택, 선택 해제 등의 공통 로직을 제공합니다.
 */
export const useClipSelection = () => {
  const ui = useUIState();

  /**
   * 단일 클립 선택
   */
  const selectClip = useCallback((clipId: string) => {
    ui.setSelectedClipIds(new Set([clipId]));
  }, [ui]);

  /**
   * 클립 선택 토글 (다중 선택 지원)
   */
  const toggleClip = useCallback((clipId: string) => {
    ui.toggleSelectedClipId(clipId);
  }, [ui]);

  /**
   * 여러 클립 선택
   */
  const selectClips = useCallback((clipIds: string[]) => {
    ui.setSelectedClipIds(new Set(clipIds));
  }, [ui]);

  /**
   * 클립 추가 선택 (다중 선택)
   */
  const addClip = useCallback((clipId: string) => {
    ui.addSelectedClipId(clipId);
  }, [ui]);

  /**
   * 클립 선택 해제
   */
  const removeClip = useCallback((clipId: string) => {
    ui.removeSelectedClipId(clipId);
  }, [ui]);

  /**
   * 모든 클립 선택 해제
   */
  const clearSelection = useCallback(() => {
    ui.clearSelectedClipIds();
  }, [ui]);

  /**
   * 선택된 클립들이 같은 트랙에 속하는지 확인
   */
  const areSelectedClipsOnSameTrack = useCallback((): boolean => {
    if (ui.selectedClipIds.size < 2) {
      return true; // 1개 이하는 항상 true
    }

    const project = getProject();
    const selectedParts = Array.from(ui.selectedClipIds)
      .map(id => project.midiParts.find(p => p.id === id))
      .filter((part): part is MidiPart => part !== undefined);

    if (selectedParts.length < 2) {
      return true;
    }

    const firstTrackId = selectedParts[0].trackId;
    return selectedParts.every(part => part.trackId === firstTrackId);
  }, [ui.selectedClipIds]);

  /**
   * 선택된 클립들의 파트 객체 가져오기
   */
  const getSelectedParts = useCallback((): MidiPart[] => {
    const project = getProject();
    return Array.from(ui.selectedClipIds)
      .map(id => project.midiParts.find(p => p.id === id))
      .filter((part): part is MidiPart => part !== undefined);
  }, [ui.selectedClipIds]);

  return {
    selectedClipIds: ui.selectedClipIds,
    selectClip,
    toggleClip,
    selectClips,
    addClip,
    removeClip,
    clearSelection,
    areSelectedClipsOnSameTrack,
    getSelectedParts,
  };
};

