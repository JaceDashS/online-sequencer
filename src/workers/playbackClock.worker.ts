type PlaybackCommand =
  | { type: 'start'; time: number }
  | { type: 'pause' }
  | { type: 'stop'; time?: number }
  | { type: 'seek'; time: number }
  | { type: 'setInterval'; intervalMs: number };

type PlaybackTick = { type: 'tick'; time: number };

const DEFAULT_INTERVAL_MS = 33;

let isPlaying = false;
let baseTime = 0;
let startPerf = 0;
let intervalMs = DEFAULT_INTERVAL_MS;
let timer: ReturnType<typeof setInterval> | null = null;

self.onmessage = (event: MessageEvent<PlaybackCommand>) => {
  const message = event.data;
  if (!message) return;

  switch (message.type) {
    case 'start':
      baseTime = Number.isFinite(message.time) ? message.time : baseTime;
      startPerf = performance.now();
      isPlaying = true;
      startTimer();
      postTick();
      break;
    case 'pause':
      if (isPlaying) {
        baseTime = getCurrentTime();
      }
      isPlaying = false;
      stopTimer();
      postTick();
      break;
    case 'stop':
      isPlaying = false;
      baseTime = Number.isFinite(message.time) ? message.time! : 0;
      stopTimer();
      postTick();
      break;
    case 'seek':
      baseTime = Number.isFinite(message.time) ? message.time : baseTime;
      if (isPlaying) {
        startPerf = performance.now();
      }
      postTick();
      break;
    case 'setInterval':
      intervalMs = Number.isFinite(message.intervalMs) ? Math.max(1, Math.floor(message.intervalMs)) : DEFAULT_INTERVAL_MS;
      if (isPlaying) {
        restartTimer();
      }
      break;
    default:
      break;
  }
};

function getCurrentTime(): number {
  if (!isPlaying) return baseTime;
  return baseTime + (performance.now() - startPerf) / 1000;
}

function postTick(): void {
  const calculatedTime = getCurrentTime();
  const tick: PlaybackTick = { type: 'tick', time: calculatedTime };

  self.postMessage(tick);
}

function startTimer(): void {
  if (timer !== null) return;
  timer = setInterval(postTick, intervalMs);
}

function stopTimer(): void {
  if (timer === null) return;
  clearInterval(timer);
  timer = null;
}

function restartTimer(): void {
  stopTimer();
  startTimer();
}
