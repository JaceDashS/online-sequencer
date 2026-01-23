type AudioLoadingListener = (isLoading: boolean, count: number) => void;

let loadingCount = 0;
const listeners = new Set<AudioLoadingListener>();

function notify(): void {
  const isLoading = loadingCount > 0;
  for (const listener of listeners) {
    listener(isLoading, loadingCount);
  }
}

export function beginAudioLoading(): void {
  loadingCount += 1;
  if (loadingCount === 1) {
    notify();
  }
}

export function endAudioLoading(): void {
  if (loadingCount === 0) {
    return;
  }
  loadingCount = Math.max(0, loadingCount - 1);
  if (loadingCount === 0) {
    notify();
  }
}

export function subscribeAudioLoading(listener: AudioLoadingListener): () => void {
  listeners.add(listener);
  listener(loadingCount > 0, loadingCount);
  return () => {
    listeners.delete(listener);
  };
}

export function getAudioLoadingCount(): number {
  return loadingCount;
}
