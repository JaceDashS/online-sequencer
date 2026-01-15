import { enqueueDebugLog } from './debugLogger';

/**
 * 재생 클럭 명령 타입
 */
type PlaybackCommand =
  | { type: 'start'; time: number }
  | { type: 'pause' }
  | { type: 'stop'; time?: number }
  | { type: 'seek'; time: number }
  | { type: 'setInterval'; intervalMs: number };

/**
 * 재생 클럭 틱 메시지 타입
 */
type PlaybackTick = { type: 'tick'; time: number };

/**
 * 재생 시간 변경 리스너 콜백 함수 타입
 */
type PlaybackListener = (time: number) => void;

let worker: Worker | null = null;
let workerFailed = false;
const listeners = new Set<PlaybackListener>();

/**
 * Worker 인스턴스를 생성하고 반환합니다
 * 
 * @returns Worker 인스턴스 또는 null (생성 실패 시)
 */
function ensureWorker(): Worker | null {
  if (workerFailed || typeof Worker === 'undefined') {
    return null;
  }

  if (!worker) {
    try {
      worker = new Worker(new URL('../workers/playbackClock.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (event: MessageEvent<PlaybackTick>) => {
        if (event.data?.type !== 'tick') return;
        const mainPerfNow = performance.now();
        const receivedTime = event.data.time;
        
        enqueueDebugLog({
          location: 'playbackClock.ts:29',
          message: 'main thread received tick',
          data: {
            mainPerfNow,
            receivedTime,
          },
          timestamp: Date.now(),
          sessionId: 'debug-session',
          runId: 'run1',
          hypothesisId: 'B',
        });
        
        for (const listener of listeners) {
          listener(receivedTime);
        }
      };
      worker.onerror = () => {
        workerFailed = true;
        worker = null;
      };
    } catch {
      workerFailed = true;
      worker = null;
      return null;
    }
  }

  return worker;
}

/**
 * Worker에 명령을 전송합니다
 * 
 * @param command - 전송할 명령
 */
function postCommand(command: PlaybackCommand): void {
  const activeWorker = ensureWorker();
  if (!activeWorker) return;
  try {
    activeWorker.postMessage(command);
  } catch {
    workerFailed = true;
    worker = null;
  }
}

/**
 * 재생 클럭 업데이트를 구독합니다
 * 
 * @param listener - 재생 시간 변경 시 호출될 콜백 함수
 * @returns 구독 해제 함수
 */
export function subscribePlaybackClock(listener: PlaybackListener): () => void {
  listeners.add(listener);
  ensureWorker();
  return () => {
    listeners.delete(listener);
  };
}

/**
 * 재생 클럭을 시작합니다
 * 
 * @param time - 시작할 재생 시간 (초)
 */
export function startPlaybackClock(time: number): void {
  postCommand({ type: 'start', time });
}

/**
 * 재생 클럭을 일시 정지합니다
 */
export function pausePlaybackClock(): void {
  postCommand({ type: 'pause' });
}

/**
 * 재생 클럭을 중지합니다
 * 
 * @param time - 중지할 재생 시간 (초, 기본값: 0)
 */
export function stopPlaybackClock(time = 0): void {
  postCommand({ type: 'stop', time });
}

/**
 * 재생 클럭의 위치를 이동합니다 (시킹)
 * 
 * @param time - 이동할 재생 시간 (초)
 */
export function seekPlaybackClock(time: number): void {
  postCommand({ type: 'seek', time });
}

/**
 * 재생 클럭의 틱 간격을 설정합니다
 * 
 * @param intervalMs - 틱 간격 (밀리초)
 */
export function setPlaybackClockInterval(intervalMs: number): void {
  postCommand({ type: 'setInterval', intervalMs });
}

/**
 * playbackClock Worker를 종료하고 리소스를 정리합니다.
 * 
 * @remarks
 * - Worker 인스턴스를 종료합니다 (`worker.terminate()`)
 * - 모든 리스너를 제거합니다
 * - 페이지 전환 또는 앱 종료 시 호출해야 합니다
 */
export function terminatePlaybackClockWorker(): void {
  if (worker) {
    try {
      worker.terminate();
    } catch (error) {
      console.warn('[playbackClock] Error terminating worker:', error);
    }
    worker = null;
  }
  
  // 리스너 정리
  listeners.clear();
  
  // 실패 플래그 리셋 (다음에 다시 생성 가능하도록)
  workerFailed = false;
}