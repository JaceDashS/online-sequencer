import { useSyncExternalStore } from 'react';
import { getPlaybackTime, subscribePlaybackTime } from '../utils/playbackTimeStore';

export function usePlaybackTime(): number {
  return useSyncExternalStore(subscribePlaybackTime, getPlaybackTime, getPlaybackTime);
}
