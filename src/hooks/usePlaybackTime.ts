import { useSyncExternalStore, useCallback, useEffect, useRef } from 'react';
import { getPlaybackTime, subscribePlaybackTime } from '../utils/playbackTimeStore';

export function usePlaybackTime(): number {
  return useSyncExternalStore(subscribePlaybackTime, getPlaybackTime, getPlaybackTime);
}

export function usePlaybackTimeControlled(freeze: boolean): number {
  const lastTimeRef = useRef(getPlaybackTime());

  const subscribe = useCallback((onStoreChange: () => void) => {
    if (freeze) {
      return () => {};
    }
    return subscribePlaybackTime((time) => {
      lastTimeRef.current = time;
      onStoreChange();
    });
  }, [freeze]);

  const getSnapshot = useCallback(() => {
    if (freeze) {
      return lastTimeRef.current;
    }
    return getPlaybackTime();
  }, [freeze]);

  const time = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    if (!freeze) {
      lastTimeRef.current = time;
    }
  }, [time, freeze]);

  return time;
}
