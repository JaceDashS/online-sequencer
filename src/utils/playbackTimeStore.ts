import { subscribePlaybackClock } from './playbackClock';

type PlaybackListener = (time: number) => void;

let sourceTime = 0;
let sourcePerf = 0;
let displayTime = 0;
let hasSource = false;
let isRunning = false;
const runningListeners = new Set<(running: boolean) => void>();
let driftThresholdMs = 20;
let rafId: number | null = null;
let isSubscribed = false;
const listeners = new Set<PlaybackListener>();
let lastSourceUpdatePerf = 0;

const MIN_SOURCE_UPDATE_INTERVAL_MS = 1;

/**
 * 고해상도 타임스탬프를 가져옵니다
 * 
 * @returns performance.now() 또는 Date.now() (fallback)
 */
function getPerfNow(): number {
  if (typeof performance !== 'undefined' && performance.now) {
    return performance.now();
  }
  return Date.now();
}

/**
 * 드리프트 보정 정보를 로깅합니다 (디버깅용)
 * 
 * @param params - 드리프트 보정 파라미터
 */
function maybeLogDrift(_params: {
  nowPerf: number;
  predicted: number;
  prevDisplayTime: number;
  driftMs: number;
  absDrift: number;
  hardResetMs: number;
  correctionType: string;
}): void {
  // Debug logging removed for production
}

/**
 * 표시할 재생 시간을 계산합니다
 * 소스 시간과 드리프트 보정을 고려하여 부드러운 시간 표시를 제공합니다
 * 
 * @param nowPerf - 현재 고해상도 타임스탬프
 * @returns 계산된 표시 시간 (초)
 */
function computeDisplayTime(nowPerf: number): number {
  if (!hasSource) {
    return displayTime;
  }
  if (!isRunning) {
    displayTime = sourceTime;
    return displayTime;
  }

  const predicted = sourceTime + (nowPerf - sourcePerf) / 1000;
  const driftMs = (predicted - displayTime) * 1000;
  const absDrift = Math.abs(driftMs);
  const hardResetMs = Math.max(200, driftThresholdMs * 8);
  const prevDisplayTime = displayTime;
  let correctionType = 'none';

  if (!Number.isFinite(displayTime) || absDrift >= hardResetMs) {
    displayTime = predicted;
    correctionType = 'hard_reset';
  } else if (absDrift <= driftThresholdMs) {
    displayTime += (driftMs / 1000) * 0.12;
    correctionType = 'smooth_small';
  } else if (absDrift <= driftThresholdMs * 4) {
    displayTime += (driftMs / 1000) * 0.35;
    correctionType = 'smooth_medium';
  } else {
    displayTime = predicted;
    correctionType = 'hard_jump';
  }

  maybeLogDrift({
    nowPerf,
    predicted,
    prevDisplayTime,
    driftMs,
    absDrift,
    hardResetMs,
    correctionType,
  });

  return displayTime;
}

/**
 * 모든 구독자에게 재생 시간 변경을 알립니다
 * 
 * @param time - 알릴 재생 시간 (초)
 */
function notify(time: number): void {
  for (const listener of listeners) {
    listener(time);
  }
}

/**
 * 애니메이션 프레임마다 호출되는 틱 함수
 * 표시 시간을 계산하고 구독자에게 알립니다
 * 
 * @param now - 현재 고해상도 타임스탬프
 */
function frameTick(now: number): void {
  rafId = null;
  if (!hasSource) return;
  const time = computeDisplayTime(now);
  notify(time);
  if (isRunning && listeners.size > 0) {
    scheduleFrame();
  }
}

/**
 * 다음 프레임 스케줄링을 요청합니다
 */
function scheduleFrame(): void {
  if (rafId !== null) return;
  if (typeof requestAnimationFrame === 'undefined') {
    frameTick(getPerfNow());
    return;
  }
  rafId = requestAnimationFrame(frameTick);
}

/**
 * 소스 재생 시간을 업데이트합니다
 * 
 * @param time - 새로운 소스 시간 (초)
 */
function updateSource(time: number): void {
  const nowPerf = getPerfNow();
  const timeSinceLastUpdate = nowPerf - lastSourceUpdatePerf;

  if (timeSinceLastUpdate < MIN_SOURCE_UPDATE_INTERVAL_MS && hasSource) {
    if (time > sourceTime) {
      sourceTime = time;
      sourcePerf = nowPerf;
    }
    if (!isRunning) {
      displayTime = sourceTime;
    }
    return;
  }

  sourceTime = time;
  sourcePerf = nowPerf;
  lastSourceUpdatePerf = nowPerf;
  hasSource = true;

  if (!isRunning) {
    displayTime = sourceTime;
  }
}

/**
 * playbackClock 구독을 보장합니다
 * 최초 한 번만 구독하며, 이후에는 재구독하지 않습니다
 */
function ensureSubscribed(): void {
  if (isSubscribed) return;
  subscribePlaybackClock((time) => {
    updateSource(time);
    if (listeners.size === 0) return;
    if (isRunning) {
      scheduleFrame();
    } else {
      notify(displayTime);
    }
  });
  isSubscribed = true;
}

/**
 * 현재 재생 시간을 가져옵니다
 * 
 * @returns 현재 표시 시간 (초)
 */
export function getPlaybackTime(): number {
  return displayTime;
}

/**
 * 재생 시간 변경을 구독합니다
 * 
 * @param listener - 재생 시간 변경 시 호출될 콜백 함수
 * @returns 구독 해제 함수
 */
export function subscribePlaybackTime(listener: PlaybackListener): () => void {
  ensureSubscribed();
  listeners.add(listener);
  listener(displayTime);
  if (listeners.size > 0 && isRunning) {
    scheduleFrame();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };
}

/**
 * 재생 시간을 설정합니다
 * 
 * @param time - 설정할 재생 시간 (초)
 */
export function setPlaybackTime(time: number): void {
  if (!Number.isFinite(time)) return;
  updateSource(time);
  displayTime = time;
  if (listeners.size > 0) {
    if (isRunning) {
      scheduleFrame();
    } else {
      notify(displayTime);
    }
  }
}

/**
 * 재생 실행 상태를 설정합니다
 * 
 * @param running - 재생 중 여부
 */
export function setPlaybackRunning(running: boolean): void {
  if (isRunning === running) {
    return;
  }

  isRunning = running;
  for (const listener of runningListeners) {
    listener(isRunning);
  }

  if (hasSource) {
    displayTime = sourceTime;
    if (isRunning) {
      sourcePerf = getPerfNow();
    }
  }

  if (listeners.size > 0) {
    if (isRunning) {
      scheduleFrame();
    } else {
      notify(displayTime);
    }
  }
}

export function getPlaybackRunning(): boolean {
  return isRunning;
}

export function subscribePlaybackRunning(listener: (running: boolean) => void): () => void {
  runningListeners.add(listener);
  listener(isRunning);
  return () => {
    runningListeners.delete(listener);
  };
}

/**
 * 재생 드리프트 임계값을 설정합니다 (밀리초)
 * 
 * @param value - 새로운 임계값 (밀리초)
 */
export function setPlaybackDriftThresholdMs(value: number): void {
  if (!Number.isFinite(value)) return;
  driftThresholdMs = Math.max(0, Math.floor(value));
}

/**
 * 재생 드리프트 임계값을 가져옵니다 (밀리초)
 * 
 * @returns 현재 드리프트 임계값 (밀리초)
 */
export function getPlaybackDriftThresholdMs(): number {
  return driftThresholdMs;
}
