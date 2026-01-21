/**
 * 파티타임 유틸리티
 * 첫 번째 트랙명이 "Jace is cool." (case insensitive)일 때 파티타임 시작
 */

import { getProject } from '../store/projectState';
import { notifyTrackChange } from '../store/projectEvents';
import { updateMasterVolume, updateMasterPan } from '../store/projectActions';

const PARTY_TIME_TRACK_NAME = 'Jace is cool.';

/**
 * 파티타임 활성화 상태
 */
let isPartyTimeActive = false;
let animationFrameId: number | null = null;
let startTime = 0;

/**
 * 각 트랙별 랜덤 애니메이션 속도 및 위상 정보
 */
interface TrackAnimationParams {
  volumeFrequency: number; // 볼륨 애니메이션 속도 (Hz)
  panFrequency: number; // 패닝 애니메이션 속도 (Hz)
  leftMeterFrequency: number; // 왼쪽 볼륨미터 속도 (Hz)
  rightMeterFrequency: number; // 오른쪽 볼륨미터 속도 (Hz)
  volumePhase: number; // 볼륨 위상
  panPhase: number; // 패닝 위상
  leftMeterPhase: number; // 왼쪽 볼륨미터 위상
  rightMeterPhase: number; // 오른쪽 볼륨미터 위상
}

const trackAnimationParams = new Map<string, TrackAnimationParams>();
const MASTER_TRACK_ID = 'master';

/**
 * 랜덤 애니메이션 파라미터 생성
 */
function generateRandomParams(): TrackAnimationParams {
  // 속도: 0.5Hz ~ 4Hz 범위
  // 위상: 0 ~ 2π 범위
  return {
    volumeFrequency: 0.5 + Math.random() * 3.5,
    panFrequency: 0.5 + Math.random() * 3.5,
    leftMeterFrequency: 0.5 + Math.random() * 3.5,
    rightMeterFrequency: 0.5 + Math.random() * 3.5,
    volumePhase: Math.random() * Math.PI * 2,
    panPhase: Math.random() * Math.PI * 2,
    leftMeterPhase: Math.random() * Math.PI * 2,
    rightMeterPhase: Math.random() * Math.PI * 2,
  };
}

/**
 * 파티타임 활성화 콜백
 */
type PartyTimeCallback = (isActive: boolean) => void;
const callbacks = new Set<PartyTimeCallback>();

/**
 * 파티타임 상태 변경 구독
 */
export function subscribePartyTime(callback: PartyTimeCallback): () => void {
  callbacks.add(callback);
  return () => {
    callbacks.delete(callback);
  };
}

/**
 * 파티타임 활성화 여부 확인
 */
export function isPartyTimeEnabled(): boolean {
  return isPartyTimeActive;
}

/**
 * 첫 번째 트랙명이 파티타임 트리거인지 확인
 */
function checkPartyTimeTrigger(): boolean {
  const project = getProject();
  if (project.tracks.length === 0) {
    return false;
  }
  const firstTrack = project.tracks[0];
  const trackName = firstTrack.name.trim().toLowerCase();
  const triggerName = PARTY_TIME_TRACK_NAME.toLowerCase();
  const matches = trackName === triggerName;
  
  return matches;
}

/**
 * 파티타임 활성화/비활성화
 */
function setPartyTimeActive(active: boolean): void {
  if (isPartyTimeActive === active) {
    return;
  }
  
  isPartyTimeActive = active;
  
  if (active) {
    startTime = performance.now();
    
    // 각 트랙별 랜덤 애니메이션 파라미터 생성
    const project = getProject();
    trackAnimationParams.clear();
    project.tracks.forEach(track => {
      trackAnimationParams.set(track.id, generateRandomParams());
    });
    
    // 마스터 볼륨/패닝도 랜덤 파라미터 생성
    trackAnimationParams.set(MASTER_TRACK_ID, generateRandomParams());
    
    startAnimation();
  } else {
    stopAnimation();
    
    // 랜덤 파라미터 초기화
    trackAnimationParams.clear();
    
    // 원래 값으로 복원 (기본값)
    const project = getProject();
    project.tracks.forEach(track => {
      track.volume = 100 / 120; // 기본 볼륨 (0dB)
      track.pan = 0.0; // 중앙
      notifyTrackChange(track.id, { volume: track.volume, pan: track.pan }, 'update');
    });
    
    // 마스터 볼륨/패닝도 기본값으로 복원
    updateMasterVolume(100 / 120); // 기본 볼륨 (0dB)
    updateMasterPan(0.0); // 중앙
  }
  
  // 콜백 호출
  callbacks.forEach(callback => callback(active));
}

/**
 * 애니메이션 시작
 */
function startAnimation(): void {
  if (animationFrameId !== null) {
    return;
  }
  
  const animate = () => {
    if (!isPartyTimeActive) {
      return;
    }
    
    const project = getProject();
    const elapsed = (performance.now() - startTime) / 1000; // 초 단위
    
    // 각 트랙별로 독립적인 애니메이션 적용
    project.tracks.forEach(track => {
      const params = trackAnimationParams.get(track.id);
      if (!params) {
        // 파라미터가 없으면 생성 (트랙이 추가된 경우)
        trackAnimationParams.set(track.id, generateRandomParams());
        return;
      }
      
      // 각 트랙별 독립적인 볼륨/패닝 애니메이션
      const volumeWave = Math.sin(elapsed * Math.PI * 2 * params.volumeFrequency + params.volumePhase);
      const panWave = Math.sin(elapsed * Math.PI * 2 * params.panFrequency + params.panPhase);
      
      // 볼륨: 0 (맨 아래, -무한대) ~ 400/120 (맨 위, +12dB) 범위로 애니메이션
      const volumeMin = 0; // 최소값: 볼륨 슬라이더 맨 아래
      const volumeMax = 400 / 120; // 최대값: 볼륨 슬라이더 맨 위 (+12dB)
      const volume = volumeMin + (volumeWave + 1) / 2 * (volumeMax - volumeMin);
      
      // 패닝: -1 ~ 1 범위로 애니메이션
      const pan = panWave;
      
      track.volume = volume;
      track.pan = pan;
      notifyTrackChange(track.id, { volume, pan }, 'update');
    });
    
    // 마스터 볼륨/패닝 애니메이션
    const masterParams = trackAnimationParams.get(MASTER_TRACK_ID);
    if (masterParams) {
      const masterVolumeWave = Math.sin(elapsed * Math.PI * 2 * masterParams.volumeFrequency + masterParams.volumePhase);
      const masterPanWave = Math.sin(elapsed * Math.PI * 2 * masterParams.panFrequency + masterParams.panPhase);
      
      // 마스터 볼륨: 0 (맨 아래, -무한대) ~ 400/120 (맨 위, +12dB) 범위로 애니메이션
      const volumeMin = 0;
      const volumeMax = 400 / 120;
      const masterVolume = volumeMin + (masterVolumeWave + 1) / 2 * (volumeMax - volumeMin);
      
      // 마스터 패닝: -1 ~ 1 범위로 애니메이션
      const masterPan = masterPanWave;
      
      updateMasterVolume(masterVolume);
      updateMasterPan(masterPan);
    }
    
    // 가짜 오디오 레벨은 getPartyTimeFakeLevel()에서 제공
    
    animationFrameId = requestAnimationFrame(animate);
  };
  
  animationFrameId = requestAnimationFrame(animate);
}

/**
 * 애니메이션 중지
 */
function stopAnimation(): void {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

/**
 * 파티타임 상태 확인 및 업데이트
 * 트랙명이 변경될 때마다 호출해야 함
 */
export function checkAndUpdatePartyTime(): void {
  const shouldBeActive = checkPartyTimeTrigger();
  if (shouldBeActive !== isPartyTimeActive) {
    setPartyTimeActive(shouldBeActive);
  } else if (shouldBeActive && isPartyTimeActive) {
    // 이미 활성화되어 있지만 트랙이 추가되었을 수 있음
    // 새로 추가된 트랙에 랜덤 파라미터 할당
    const project = getProject();
    project.tracks.forEach(track => {
      if (!trackAnimationParams.has(track.id)) {
        trackAnimationParams.set(track.id, generateRandomParams());
      }
    });
    
    // 마스터 파라미터도 확인
    if (!trackAnimationParams.has(MASTER_TRACK_ID)) {
      trackAnimationParams.set(MASTER_TRACK_ID, generateRandomParams());
    }
  }
}

/**
 * 파티타임 모드에서 가짜 오디오 레벨 가져오기
 * 각 트랙의 왼쪽과 오른쪽 채널이 독립적으로 파티타임
 */
export function getPartyTimeFakeLevel(trackId: string, _channel: 'left' | 'right'): { left: number; right: number } | null {
  if (!isPartyTimeActive) {
    return null;
  }
  
  const params = trackAnimationParams.get(trackId);
  if (!params) {
    // 파라미터가 없으면 기본값 반환
    return { left: -Infinity, right: -Infinity };
  }
  
  const elapsed = (performance.now() - startTime) / 1000;
  
  // 각 트랙의 왼쪽과 오른쪽 채널이 완전히 독립적으로 움직임
  const leftWave = Math.sin(elapsed * Math.PI * 2 * params.leftMeterFrequency + params.leftMeterPhase);
  const rightWave = Math.sin(elapsed * Math.PI * 2 * params.rightMeterFrequency + params.rightMeterPhase);
  
  // dB 범위: -60dB ~ 0dB
  const leftDb = leftWave * 30 - 30; // -60 ~ 0dB 범위
  const rightDb = rightWave * 30 - 30; // -60 ~ 0dB 범위
  
  return {
    left: leftDb,
    right: rightDb
  };
}

