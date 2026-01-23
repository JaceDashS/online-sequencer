/**
 * 트랙 관련 액션들
 * 
 * 이 모듈은 트랙의 추가, 삭제, 수정 등의 작업을 담당합니다.
 * P1 리팩토링의 일부로 projectStore.ts에서 분리되었습니다.
 */

import type { Track, Effect } from '../../types/project';
import { getProject, addTrackToProject, removeTrackFromProject, findTrackById, findMidiPartsByTrackId } from '../projectState';
import { notifyProjectChange, notifyTrackChange } from '../projectEvents';
import { removeMidiPart } from '../midiPartActions';
import { checkAndUpdatePartyTime } from '../../utils/partyTime';
import { preloadPlaybackSamples } from '../../utils/audioPreload';

/**
 * ID로 트랙을 찾습니다 (인덱스 사용).
 * 
 * @param trackId - 찾을 트랙의 ID
 * @returns 찾은 트랙 또는 undefined
 */
export const findTrack = (trackId: string): Track | undefined => {
  return findTrackById(trackId);
};

/**
 * 트랙이 존재하는지 확인하고 타입을 단언합니다.
 * 트랙이 없으면 에러를 던집니다.
 * 
 * @param track - 확인할 트랙 (undefined일 수 있음)
 * @param trackId - 에러 메시지에 포함할 트랙 ID (선택)
 * @throws {Error} 트랙이 없을 경우
 */
export function assertTrack(track: Track | undefined, trackId?: string): asserts track is Track {
  if (!track) {
    throw new Error(`Track not found${trackId ? `: ${trackId}` : ''}`);
  }
}

/**
 * 새 트랙을 추가합니다.
 * 
 * @param track - 추가할 트랙 객체
 * @throws {Error} 최대 10개 트랙 제한을 초과할 경우
 */
export const addTrack = (track: Track): void => {
  if (getProject().tracks.length >= 10) {
    throw new Error('최대 10개의 트랙만 추가할 수 있습니다.');
  }
  addTrackToProject(track);
  notifyProjectChange({ type: 'track' as const, trackId: track.id });
  void preloadPlaybackSamples(getProject());
  
  // 파티타임 확인 (트랙 추가 시)
  setTimeout(() => {
    checkAndUpdatePartyTime();
  }, 0);
};

/**
 * 트랙을 삭제합니다.
 * 해당 트랙에 속한 모든 MIDI 파트도 함께 삭제됩니다.
 * 
 * @param trackId - 삭제할 트랙의 ID
 */
export const removeTrack = (trackId: string): void => {
  // 해당 트랙에 속한 모든 MIDI 파트 찾기 (인덱스 사용)
  const partsToRemove = findMidiPartsByTrackId(trackId);
  
  // 해당 트랙에 속한 모든 MIDI 파트 삭제 (히스토리 포함)
  partsToRemove.forEach(part => {
    removeMidiPart(part.id, true); // skipHistory=true로 설정하여 개별 히스토리 추가 방지
  });
  
  // 트랙 삭제
  removeTrackFromProject(trackId);
  notifyProjectChange({ type: 'track' as const, trackId });
};

/**
 * 트랙의 속성을 업데이트합니다.
 * 
 * @param trackId - 업데이트할 트랙의 ID
 * @param updates - 업데이트할 트랙 속성들 (부분 업데이트 가능)
 */
export const updateTrack = (trackId: string, updates: Partial<Track>): void => {
  const track = findTrack(trackId);
  if (track) {
    const previousInstrument = track.instrument;
    Object.assign(track, updates);
    notifyTrackChange(trackId, updates, 'update');
    if (updates.instrument !== undefined && updates.instrument !== previousInstrument) {
      void preloadPlaybackSamples(getProject());
    }
    
    // 파티타임 확인 (트랙명이 변경된 경우)
    // 트랙명이 완전히 저장된 후 확인
    if (updates.name !== undefined) {
      // 다음 틱에서 확인하여 트랙명이 완전히 반영된 후 체크
      setTimeout(() => {
        checkAndUpdatePartyTime();
      }, 0);
    }
  }
};

/**
 * 트랙에 이펙터 추가
 */
export const addEffectToTrack = (trackId: string, effect: Effect): void => {
  const track = findTrack(trackId);
  if (track) {
    if (!track.effects) {
      track.effects = [];
    }
    track.effects.push(effect);
    notifyTrackChange(trackId, { effects: track.effects }, 'update');
  }
};

/**
 * 트랙에서 이펙터 제거
 */
export const removeEffectFromTrack = (trackId: string, effectIndex: number): void => {
  const track = findTrack(trackId);
  if (track && effectIndex >= 0 && effectIndex < track.effects.length) {
    track.effects.splice(effectIndex, 1);
    notifyTrackChange(trackId, { effects: track.effects }, 'update');
  }
};

/**
 * 트랙의 이펙터 업데이트
 */
export const updateEffectInTrack = (trackId: string, effectIndex: number, updates: Partial<Effect>): void => {
  const track = findTrack(trackId);
  if (track && effectIndex >= 0 && effectIndex < track.effects.length) {
    Object.assign(track.effects[effectIndex], updates);
    notifyTrackChange(trackId, { effects: track.effects }, 'update');
  }
};

/**
 * 트랙의 이펙터 순서 변경 (드래그 앤 드롭)
 */
export const reorderEffectsInTrack = (trackId: string, fromIndex: number, toIndex: number): void => {
  const track = findTrack(trackId);
  if (track && fromIndex >= 0 && fromIndex < track.effects.length && toIndex >= 0 && toIndex < track.effects.length) {
    const [movedEffect] = track.effects.splice(fromIndex, 1);
    track.effects.splice(toIndex, 0, movedEffect);
    notifyTrackChange(trackId, { effects: track.effects }, 'update');
  }
};

/**
 * 트랙 변경 이벤트 타입 (재export)
 */
export type { TrackChangeEvent } from '../projectEvents';

