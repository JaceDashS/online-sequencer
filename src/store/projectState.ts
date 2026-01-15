import type { Project, LegacyProject, MidiPart, Track } from '../types/project';
import { 
  createSimpleTiming as createSimpleTimingFromTiming,
  getBpm as getBpmFromTiming,
  getTimeSignature as getTimeSignatureFromTiming
} from '../domain/timing/timingUtils';
import { migrateProjectAtLoad } from './projectMigration';
import { notifyProjectChange, notifyTrackChange } from './projectEvents';

/**
 * 초기 프로젝트 상태
 */
const initialProject: Project = {
  version: 2, // Tick 기반 프로젝트 포맷
  // SSOT: Timing Map
  timing: createSimpleTimingFromTiming(120, [4, 4]),
  tracks: [
    {
      id: 'track-1',
      name: 'Track 1',
      instrument: 'piano',
      volume: 100 / 120,
      pan: 0.0,
      effects: [],
      solo: false,
      mute: false,
      mutedBySolo: false,
    },
  ],
  midiParts: [],
  masterVolume: 100 / 120,
  masterPan: 0.0,
  masterEffects: [
    {
      type: 'delay',
      enabled: true,
      params: {
        delayDivision: 0.25, // 1/4
        feedback: 50, // 50%
        mix: 15, // 15%
      },
    },
    {
      type: 'reverb',
      enabled: true,
      params: {
        roomSize: 50, // 50%
        dampening: 30, // 30%
        wetLevel: 30, // 30%
      },
    },
  ],
};

/**
 * 현재 프로젝트 상태
 */
let currentProject: Project = { ...initialProject };

// 초기 프로젝트 상태에 대해 인덱스 초기화
// rebuildIndexes 함수가 정의되기 전에 호출되므로, 함수 정의 후 호출하도록 수정
// (함수 호이스팅에 의존하지 않고 명시적으로 초기화)

/**
 * 성능 최적화를 위한 인덱스 (P2 작업)
 * 배열과 병행하여 유지되며, 조회 성능을 O(1)로 개선합니다.
 */
const tracksIndex = new Map<string, Track>();
const midiPartsIndex = new Map<string, MidiPart>();
const midiPartsByTrackIdIndex = new Map<string, Set<string>>(); // trackId -> Set<partId>

/**
 * 현재 프로젝트 상태를 가져옵니다.
 * 
 * @returns 현재 프로젝트 객체 (참조 반환)
 * 
 * @remarks
 * 반환된 객체는 직접 수정하지 말고, 제공된 업데이트 함수를 사용하세요.
 */
export const getProject = (): Project => {
  return currentProject;
};

/**
 * 프로젝트를 로드합니다.
 * 마이그레이션이 필요한 경우 자동으로 실행합니다.
 * 
 * @param project - 로드할 프로젝트
 * @param skipMigration - 마이그레이션을 건너뛸지 여부 (기본값: false)
 * 
 * @remarks
 * 프로젝트를 로드하면 모든 구독자에게 변경 이벤트가 발행됩니다.
 * timing 필드가 없으면 레거시 bpm/timeSignature로부터 생성합니다.
 */
export const setProject = (project: Project, skipMigration = false): void => {
  let projectToLoad = project;
  
  // 마이그레이션이 필요한지 확인하고 실행
  if (!skipMigration) {
    projectToLoad = migrateProjectAtLoad(project);
  }
  
  // 마이그레이션용: timing 필드가 없으면 레거시 프로젝트의 bpm/timeSignature로부터 생성
  if (!projectToLoad.timing) {
    const legacyProject = projectToLoad as LegacyProject; // 마이그레이션을 위해 레거시 필드 접근
    const bpm = legacyProject.bpm ?? 120;
    const timeSignature = legacyProject.timeSignature ?? [4, 4];
    projectToLoad.timing = createSimpleTimingFromTiming(bpm, timeSignature);
  }
  
  // 프로젝트 설정
  currentProject = projectToLoad;
  
  // midiParts와 tracks 배열이 없으면 초기화
  if (!currentProject.midiParts) {
    currentProject.midiParts = [];
  }
  if (!currentProject.tracks) {
    currentProject.tracks = [];
  }
  
  // 인덱스 재구축 (프로젝트 로드 시)
  rebuildIndexes(currentProject);
  
  // 모든 구독자에게 변경 이벤트 발행
  notifyProjectChange({ type: 'bpm' as const, bpm: getBpmFromTiming(currentProject) });
  notifyProjectChange({ type: 'timeSignature' as const, timeSignature: getTimeSignatureFromTiming(currentProject) });
  currentProject.midiParts.forEach(part => {
    notifyProjectChange({ type: 'midiPart' as const, partId: part.id });
  });
  currentProject.tracks.forEach(track => {
    notifyTrackChange(track.id, {}, 'update');
  });
};

/**
 * 프로젝트의 스냅샷을 생성합니다 (딥 클론).
 * 
 * @returns 프로젝트의 복사본
 */
export const createProjectSnapshot = (): Project => {
  return structuredClone(currentProject);
};

/**
 * 프로젝트를 스냅샷으로 복원합니다.
 * 
 * @param snapshot - 복원할 프로젝트 스냅샷
 */
export const restoreProjectFromSnapshot = (snapshot: Project): void => {
  currentProject = structuredClone(snapshot);
  // 인덱스 재구축 (프로젝트가 복원되었으므로)
  rebuildIndexes(currentProject);
};

/**
 * 프로젝트를 불변하게 업데이트합니다.
 * 
 * @param updater - 프로젝트를 업데이트하는 함수 (새 프로젝트 객체 반환)
 * 
 * @remarks
 * - 현재 프로젝트의 스냅샷을 생성하여 updater에 전달합니다.
 * - updater는 새로운 프로젝트 객체를 반환해야 합니다.
 * - 반환된 프로젝트가 currentProject에 설정됩니다.
 * 
 * @example
 * ```typescript
 * updateProjectImmutable(project => ({
 *   ...project,
 *   masterVolume: 0.8
 * }));
 * ```
 */
export const updateProjectImmutable = (updater: (project: Project) => Project): void => {
  const snapshot = createProjectSnapshot();
  currentProject = updater(snapshot);
  // 인덱스 재구축 (프로젝트 전체가 변경되었으므로)
  rebuildIndexes(currentProject);
};

/**
 * 인덱스를 프로젝트 배열로부터 재구축합니다.
 * 프로젝트 로드 시 또는 인덱스 일관성이 깨졌을 때 사용됩니다.
 * 
 * @param project - 재구축할 프로젝트
 */
function rebuildIndexes(project: Project): void {
  // 트랙 인덱스 재구축
  tracksIndex.clear();
  project.tracks.forEach(track => {
    tracksIndex.set(track.id, track);
  });
  
  // MIDI 파트 인덱스 재구축
  midiPartsIndex.clear();
  midiPartsByTrackIdIndex.clear();
  project.midiParts.forEach(part => {
    midiPartsIndex.set(part.id, part);
    
    // 트랙별 파트 인덱스 업데이트
    if (part.trackId) {
      let partIds = midiPartsByTrackIdIndex.get(part.trackId);
      if (!partIds) {
        partIds = new Set<string>();
        midiPartsByTrackIdIndex.set(part.trackId, partIds);
      }
      partIds.add(part.id);
    }
  });
}

/**
 * 트랙을 인덱스에 추가합니다.
 * 
 * @param track - 추가할 트랙
 */
function addTrackToIndex(track: Track): void {
  tracksIndex.set(track.id, track);
}

/**
 * 트랙을 인덱스에서 제거합니다.
 * 
 * @param trackId - 제거할 트랙 ID
 */
function removeTrackFromIndex(trackId: string): void {
  tracksIndex.delete(trackId);
  // 해당 트랙의 파트 인덱스도 정리
  const partIds = midiPartsByTrackIdIndex.get(trackId);
  if (partIds) {
    partIds.forEach(partId => {
      midiPartsIndex.delete(partId);
    });
    midiPartsByTrackIdIndex.delete(trackId);
  }
}

/**
 * MIDI 파트를 인덱스에 추가합니다.
 * 
 * @param part - 추가할 MIDI 파트
 */
function addMidiPartToIndex(part: MidiPart): void {
  midiPartsIndex.set(part.id, part);
  
  // 트랙별 파트 인덱스 업데이트
  if (part.trackId) {
    let partIds = midiPartsByTrackIdIndex.get(part.trackId);
    if (!partIds) {
      partIds = new Set<string>();
      midiPartsByTrackIdIndex.set(part.trackId, partIds);
    }
    partIds.add(part.id);
  }
}

/**
 * MIDI 파트를 인덱스에서 제거합니다.
 * 
 * @param partId - 제거할 파트 ID
 */
function removeMidiPartFromIndex(partId: string): void {
  const part = midiPartsIndex.get(partId);
  if (part) {
    // 트랙별 파트 인덱스에서 제거
    if (part.trackId) {
      const partIds = midiPartsByTrackIdIndex.get(part.trackId);
      if (partIds) {
        partIds.delete(partId);
        // Set이 비어있으면 제거
        if (partIds.size === 0) {
          midiPartsByTrackIdIndex.delete(part.trackId);
        }
      }
    }
    midiPartsIndex.delete(partId);
  }
}

/**
 * MIDI 파트 인덱스를 업데이트합니다.
 * trackId 변경 시 트랙별 인덱스도 함께 업데이트됩니다.
 * 
 * @param partId - 업데이트할 파트 ID
 * @param oldPart - 이전 파트 정보 (trackId 확인용)
 * @param newPart - 새로운 파트 정보
 * 
 * @remarks
 * 이 함수는 midiPartActions에서 사용되므로 export합니다.
 */
export function updateMidiPartInIndex(partId: string, oldPart: MidiPart | undefined, newPart: MidiPart): void {
  midiPartsIndex.set(partId, newPart);
  
  // trackId가 변경된 경우 트랙별 인덱스 업데이트
  const oldTrackId = oldPart?.trackId;
  const newTrackId = newPart.trackId;
  
  if (oldTrackId !== newTrackId) {
    // 이전 트랙 인덱스에서 제거
    if (oldTrackId) {
      const oldPartIds = midiPartsByTrackIdIndex.get(oldTrackId);
      if (oldPartIds) {
        oldPartIds.delete(partId);
        if (oldPartIds.size === 0) {
          midiPartsByTrackIdIndex.delete(oldTrackId);
        }
      }
    }
    
    // 새 트랙 인덱스에 추가
    if (newTrackId) {
      let newPartIds = midiPartsByTrackIdIndex.get(newTrackId);
      if (!newPartIds) {
        newPartIds = new Set<string>();
        midiPartsByTrackIdIndex.set(newTrackId, newPartIds);
      }
      newPartIds.add(partId);
    }
  }
}

/**
 * 인덱스에서 트랙을 조회합니다 (내부 함수).
 * 외부에서는 findTrack, selectTrackById 등을 사용하세요.
 * 
 * @param trackId - 조회할 트랙 ID
 * @returns 트랙 객체 또는 undefined
 */
function getTrackByIdFromIndex(trackId: string): Track | undefined {
  return tracksIndex.get(trackId);
}

/**
 * 인덱스에서 MIDI 파트를 조회합니다 (내부 함수).
 * 외부에서는 findMidiPart, selectMidiPart 등을 사용하세요.
 * 
 * @param partId - 조회할 파트 ID
 * @returns MIDI 파트 객체 또는 undefined
 */
function getMidiPartByIdFromIndex(partId: string): MidiPart | undefined {
  return midiPartsIndex.get(partId);
}

/**
 * 인덱스에서 트랙 ID로 MIDI 파트 목록을 조회합니다 (내부 함수).
 * 외부에서는 selectMidiPartsByTrackId 등을 사용하세요.
 * 
 * @param trackId - 조회할 트랙 ID
 * @returns 해당 트랙의 MIDI 파트 배열
 */
function getMidiPartsByTrackIdFromIndex(trackId: string): MidiPart[] {
  const partIds = midiPartsByTrackIdIndex.get(trackId);
  if (!partIds || partIds.size === 0) {
    return [];
  }
  
  const parts: MidiPart[] = [];
  partIds.forEach(partId => {
    const part = midiPartsIndex.get(partId);
    if (part) {
      parts.push(part);
    }
  });
  
  return parts;
}

/**
 * 트랙을 ID로 조회합니다 (인덱스 사용).
 * 
 * @param trackId - 조회할 트랙 ID
 * @returns 트랙 객체 또는 undefined
 */
export const findTrackById = (trackId: string): Track | undefined => {
  return getTrackByIdFromIndex(trackId);
};

/**
 * MIDI 파트를 ID로 조회합니다 (인덱스 사용).
 * 
 * @param partId - 조회할 파트 ID
 * @returns MIDI 파트 객체 또는 undefined
 */
export const findMidiPartById = (partId: string): MidiPart | undefined => {
  return getMidiPartByIdFromIndex(partId);
};

/**
 * 트랙 ID로 MIDI 파트 목록을 조회합니다 (인덱스 사용).
 * 
 * @param trackId - 조회할 트랙 ID
 * @returns 해당 트랙의 MIDI 파트 배열
 */
export const findMidiPartsByTrackId = (trackId: string): MidiPart[] => {
  return getMidiPartsByTrackIdFromIndex(trackId);
};

/**
 * 프로젝트의 MIDI 파트 배열에 파트를 추가합니다.
 * 
 * @param part - 추가할 MIDI 파트
 * 
 * @remarks
 * 내부적으로 배열 조작과 인덱스 업데이트를 수행하며, 액션 함수에서 사용됩니다.
 */
export const addMidiPartToProject = (part: MidiPart): void => {
  currentProject.midiParts.push(part);
  addMidiPartToIndex(part);
};

/**
 * 프로젝트의 MIDI 파트 배열에서 파트를 제거합니다.
 * 
 * @param partId - 제거할 MIDI 파트의 ID
 * 
 * @remarks
 * 내부적으로 배열 필터링과 인덱스 업데이트를 수행하며, 액션 함수에서 사용됩니다.
 */
export const removeMidiPartFromProject = (partId: string): void => {
  currentProject.midiParts = currentProject.midiParts.filter(p => p.id !== partId);
  removeMidiPartFromIndex(partId);
};

/**
 * 프로젝트의 MIDI 파트 배열에서 여러 파트를 제거합니다.
 * 
 * @param partIds - 제거할 MIDI 파트 ID들의 Set
 * 
 * @remarks
 * 내부적으로 배열 필터링과 인덱스 업데이트를 수행하며, 액션 함수에서 사용됩니다.
 */
export const removeMultipleMidiPartsFromProject = (partIds: Set<string>): void => {
  currentProject.midiParts = currentProject.midiParts.filter(p => !partIds.has(p.id));
  // 각 파트를 인덱스에서 제거
  partIds.forEach(partId => {
    removeMidiPartFromIndex(partId);
  });
};

/**
 * 프로젝트의 트랙 배열에 트랙을 추가합니다.
 * 
 * @param track - 추가할 트랙
 * 
 * @remarks
 * 내부적으로 배열 조작과 인덱스 업데이트를 수행하며, 액션 함수에서 사용됩니다.
 */
export const addTrackToProject = (track: Track): void => {
  currentProject.tracks.push(track);
  addTrackToIndex(track);
};

/**
 * 프로젝트의 트랙 배열에서 트랙을 제거합니다.
 * 
 * @param trackId - 제거할 트랙의 ID
 * 
 * @remarks
 * 내부적으로 배열 필터링과 인덱스 업데이트를 수행하며, 액션 함수에서 사용됩니다.
 */
export const removeTrackFromProject = (trackId: string): void => {
  currentProject.tracks = currentProject.tracks.filter(t => t.id !== trackId);
  removeTrackFromIndex(trackId);
};

// 초기 프로젝트 상태에 대해 인덱스 초기화 (모듈 로드 시 한 번 실행)
// rebuildIndexes 함수가 정의된 후에 호출
rebuildIndexes(currentProject);

