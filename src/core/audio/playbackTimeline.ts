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
