export type PlaybackAnchor = {
  timelineTime: number;
  audioTime: number;
};

export type ScheduledPlaybackWindow = {
  timelineStart: number;
  duration: number;
  skipTime: number;
};

export function createPlaybackAnchor(
  timelineTime: number,
  audioCurrentTime: number,
  leadSeconds: number
): PlaybackAnchor {
  const safeTimelineTime = Number.isFinite(timelineTime) ? timelineTime : 0;
  const safeAudioCurrentTime = Number.isFinite(audioCurrentTime) ? audioCurrentTime : 0;
  const safeLeadSeconds = Number.isFinite(leadSeconds) ? Math.max(0, leadSeconds) : 0;
  return {
    timelineTime: safeTimelineTime,
    audioTime: safeAudioCurrentTime + safeLeadSeconds,
  };
}

export function getTimelineTimeAtAudioTime(
  anchor: PlaybackAnchor,
  audioCurrentTime: number
): number {
  if (!Number.isFinite(audioCurrentTime)) {
    return anchor.timelineTime;
  }
  const elapsed = Math.max(0, audioCurrentTime - anchor.audioTime);
  return anchor.timelineTime + elapsed;
}

export function getAudioTimeForTimelineTime(
  anchor: PlaybackAnchor,
  timelineTime: number
): number {
  return anchor.audioTime + (timelineTime - anchor.timelineTime);
}

export function getAnchorStartDelaySeconds(
  anchor: PlaybackAnchor,
  audioCurrentTime: number
): number {
  if (!Number.isFinite(audioCurrentTime)) {
    return 0;
  }
  return Math.max(0, anchor.audioTime - audioCurrentTime);
}

export function getBoundedPitchOffsetSeconds(
  overlappingNoteCount: number,
  maxOffsetMs: number
): number {
  if (
    !Number.isFinite(overlappingNoteCount) ||
    overlappingNoteCount <= 0 ||
    !Number.isFinite(maxOffsetMs)
  ) {
    return 0;
  }
  return Math.max(0, maxOffsetMs) / 1000;
}

export function resolveScheduledPlaybackWindow(
  noteStartTime: number,
  noteDuration: number,
  timelineTime: number
): ScheduledPlaybackWindow | null {
  const noteEndTime = noteStartTime + noteDuration;
  if (noteDuration <= 0 || noteEndTime <= timelineTime) {
    return null;
  }

  const timelineStart = Math.max(noteStartTime, timelineTime);
  return {
    timelineStart,
    duration: noteEndTime - timelineStart,
    skipTime: Math.max(0, timelineStart - noteStartTime),
  };
}

/**
 * 예약 고갈 시 lookahead 자동 보정
 *
 * 메인 스레드 렉으로 예약 잔량이 임계값 아래로 떨어지면 lookahead를 단계적으로 늘린다.
 * 늘린 값은 페이지를 닫거나 수동으로 초기화할 때까지 유지한다(렉이 잦은 환경은 계속 여유를 둔다).
 */
export const AUTO_LOOKAHEAD = {
  /** 한 번에 늘리는 양 (초) */
  STEP_SECONDS: 0.25,
  /** 자동 보정으로 도달할 수 있는 최대 lookahead (초). 수동 설정이 이보다 크면 더 늘리지 않는다 */
  MAX_TOTAL_SECONDS: 2,
  /** 연속 증가 간 최소 간격 (ms). 한 번의 렉으로 여러 단계가 오르지 않도록 한다 */
  COOLDOWN_MS: 2000,
  /** 예약 잔량이 이 값 미만이면 고갈 위험으로 본다 (초) */
  LOW_REMAINING_SECONDS: 0.05,
} as const;

export interface AutoLookaheadState {
  extraSeconds: number;
  increaseCount: number;
  lastIncreaseAtMs: number | null;
}

export const INITIAL_AUTO_LOOKAHEAD: AutoLookaheadState = {
  extraSeconds: 0,
  increaseCount: 0,
  lastIncreaseAtMs: null,
};

export function getEffectiveLookaheadSeconds(baseSeconds: number, state: AutoLookaheadState): number {
  const base = Number.isFinite(baseSeconds) ? Math.max(0, baseSeconds) : 0;
  return Math.min(5, base + Math.max(0, state.extraSeconds));
}

/**
 * 예약 잔량을 보고 다음 보정 상태를 계산한다. 바뀌지 않으면 같은 객체를 반환한다.
 */
export function nextAutoLookahead(
  state: AutoLookaheadState,
  baseSeconds: number,
  remainingSeconds: number,
  nowMs: number,
  enabled: boolean
): AutoLookaheadState {
  if (!enabled || !Number.isFinite(remainingSeconds) || remainingSeconds >= AUTO_LOOKAHEAD.LOW_REMAINING_SECONDS) {
    return state;
  }
  if (state.lastIncreaseAtMs !== null && nowMs - state.lastIncreaseAtMs < AUTO_LOOKAHEAD.COOLDOWN_MS) {
    return state;
  }
  const base = Number.isFinite(baseSeconds) ? Math.max(0, baseSeconds) : 0;
  const maxExtra = Math.max(0, AUTO_LOOKAHEAD.MAX_TOTAL_SECONDS - base);
  if (state.extraSeconds >= maxExtra) {
    return state;
  }
  return {
    extraSeconds: Math.min(maxExtra, state.extraSeconds + AUTO_LOOKAHEAD.STEP_SECONDS),
    increaseCount: state.increaseCount + 1,
    lastIncreaseAtMs: nowMs,
  };
}
