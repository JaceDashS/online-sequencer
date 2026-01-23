import React, { useEffect, useRef } from 'react';
import { getPlaybackTime, subscribePlaybackTime } from '../../utils/playbackTimeStore';

const DEFAULT_THROTTLE_FPS = 30;

export interface PlaybackPlayheadProps {
  className?: string;
  partStartTime: number;
  pixelsPerSecond: number;
  style?: React.CSSProperties;
  onMouseDown?: (event: React.MouseEvent<HTMLDivElement>) => void;
  throttleFps?: number;
}

export const PlaybackPlayhead: React.FC<PlaybackPlayheadProps> = React.memo(({
  className,
  partStartTime,
  pixelsPerSecond,
  style,
  onMouseDown,
  throttleFps = DEFAULT_THROTTLE_FPS,
}) => {
  const playheadRef = useRef<HTMLDivElement>(null);
  const pendingXRef = useRef(0);
  const lastXRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef(0);

  useEffect(() => {
    lastXRef.current = null;
    pendingXRef.current = 0;
    lastFrameTimeRef.current = 0;

    const frameIntervalMs = 1000 / Math.max(1, throttleFps);

    const flush = (now: number) => {
      if (now - lastFrameTimeRef.current < frameIntervalMs) {
        rafRef.current = requestAnimationFrame(flush);
        return;
      }

      lastFrameTimeRef.current = now;
      rafRef.current = null;

      const node = playheadRef.current;
      if (!node) return;

      const nextX = pendingXRef.current;
      if (lastXRef.current === nextX) return;

      lastXRef.current = nextX;
      node.style.transform = `translateX(${nextX}px)`;
    };

    const update = (time: number) => {
      pendingXRef.current = (time - partStartTime) * pixelsPerSecond;
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(flush);
      }
    };

    update(getPlaybackTime());
    const unsubscribe = subscribePlaybackTime(update);

    return () => {
      unsubscribe();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [partStartTime, pixelsPerSecond, throttleFps]);

  return (
    <div
      ref={playheadRef}
      className={className}
      style={{ left: 0, ...style }}
      onMouseDown={onMouseDown}
    />
  );
});

PlaybackPlayhead.displayName = 'PlaybackPlayhead';
