import { getPlaybackRunning, subscribePlaybackRunning } from './playbackTimeStore';
import { getLongTaskLogEnabled } from './debugLogToggles';

let isInitialized = false;
let lastLogAt = 0;
const LOG_THROTTLE_MS = 1000;

export function initLongTaskLogger(): void {
  if (isInitialized) return;
  isInitialized = true;

  if (typeof PerformanceObserver === 'undefined') {
    return;
  }
  let playbackRunning = getPlaybackRunning();
  subscribePlaybackRunning((running) => {
    playbackRunning = running;
  });

  try {
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const now = performance.now();
      if (!playbackRunning || !getLongTaskLogEnabled() || now - lastLogAt < LOG_THROTTLE_MS) {
        return;
      }
      lastLogAt = now;
      const entry = entries[0];
      if (!entry) return;
      const duration = Math.round(entry.duration);
      const attribution = (entry as PerformanceEntry & {
        attribution?: Array<{
          name?: string;
          containerType?: string;
          containerId?: string;
          containerName?: string;
          scriptUrl?: string;
        }>;
      }).attribution;
      const attributionText = attribution?.map((item) => {
        const parts = [
          item.name,
          item.containerType,
          item.containerName,
          item.scriptUrl,
        ].filter(Boolean);
        return parts.join(' / ');
      }).filter(Boolean).join(' | ');
      console.log(
        `[longtask] ${duration}ms` +
          (attributionText ? ` - ${attributionText}` : '')
      );
    });

    observer.observe({ entryTypes: ['longtask'] });
  } catch {
    // Ignore observer errors in unsupported environments.
  }
}
