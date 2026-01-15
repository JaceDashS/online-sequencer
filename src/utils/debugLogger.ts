/**
 * 디버그 로그 엔트리 인터페이스
 */
export interface DebugLogEntry {
  /** 로그가 발생한 위치 (파일명, 함수명 등) */
  location: string;
  /** 로그 메시지 */
  message: string;
  /** 추가 데이터 (선택) */
  data?: Record<string, unknown>;
  /** 타임스탬프 */
  timestamp: number;
  /** 세션 ID (선택) */
  sessionId?: string;
  /** 실행 ID (선택) */
  runId?: string;
  /** 가설 ID (선택) */
  hypothesisId?: string;
}

/**
 * 디버그 로그 수집을 위한 유틸리티
 * 
 * @remarks
 * - 개발/디버깅 환경에서 로그를 수집하여 원격 서버로 전송합니다
 * - 프로덕션 환경에서는 사용하지 않는 것을 권장합니다
 * - Worker를 통해 비동기적으로 처리되며, 버퍼링을 지원합니다
 */

const INGEST_URL = 'http://127.0.0.1:7242/ingest/870903ce-f6b4-4dbe-9e94-841bab6b23ed';
const DEFAULT_BUFFER_SIZE = 0;
const IDLE_FLUSH_MS = 4000;

// 환경별 로깅 설정
// 프로덕션 환경에서는 기본적으로 로깅 비활성화
const isProduction = import.meta.env?.MODE === 'production' || import.meta.env?.PROD === true;
let loggingEnabled = !isProduction; // 개발 환경에서는 활성화, 프로덕션에서는 비활성화

let worker: Worker | null = null;
let workerFailed = false;

let bufferSize = DEFAULT_BUFFER_SIZE;
let buffer: DebugLogEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let isFlushing = false;

/**
 * 로깅 활성화 상태를 설정합니다.
 * 
 * @param enabled - 로깅 활성화 여부
 * 
 * @remarks
 * - 런타임에 로깅을 활성화/비활성화할 수 있습니다
 * - 프로덕션 환경에서도 개발/디버깅 목적으로 임시 활성화 가능
 * - 개발자 도구에서 제어 가능하도록 설계됨
 */
export function setLoggingEnabled(enabled: boolean): void {
  loggingEnabled = enabled;
  
  // 로깅이 비활성화되면 버퍼 정리 및 Worker 종료
  if (!enabled) {
    buffer = [];
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    isFlushing = false;
    
    // Worker 종료 (flush 없이)
    if (worker) {
      try {
        worker.terminate();
      } catch {
        // 무시
      }
      worker = null;
    }
    workerFailed = false;
    bufferSize = 0;
  }
}

/**
 * 현재 로깅 활성화 상태를 반환합니다.
 * 
 * @returns 로깅 활성화 여부
 */
export function isLoggingEnabled(): boolean {
  return loggingEnabled;
}

/**
 * 디버그 로그 버퍼 크기를 설정합니다
 * 
 * @param size - 버퍼 크기 (0이면 버퍼링 비활성화)
 * 
 * @remarks
 * - 로깅이 비활성화되어 있으면 설정을 무시합니다
 * - 버퍼 크기가 0이면 즉시 전송됩니다
 * - 버퍼 크기가 1이면 각 엔트리를 개별적으로 전송합니다
 * - 버퍼 크기가 1보다 크면 해당 크기까지 버퍼링 후 일괄 전송합니다
 */
export function setDebugLogBufferSize(size: number): void {
  // 로깅이 비활성화되어 있으면 설정을 무시
  if (!loggingEnabled) {
    return;
  }
  
  if (!Number.isFinite(size)) return;
  const nextSize = Math.max(0, Math.floor(size));
  bufferSize = nextSize;

  if (tryPostToWorker({ type: 'setBufferSize', size: nextSize })) {
    return;
  }
  if (bufferSize === 0) {
    buffer = [];
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    return;
  }
  if (buffer.length >= bufferSize) {
    void flush();
  }
}

/**
 * 디버그 로그를 큐에 추가합니다
 * 
 * @param entry - 디버그 로그 엔트리
 * 
 * @remarks
 * - 로깅이 비활성화되어 있으면 즉시 반환합니다
 * - Worker가 활성화되어 있으면 Worker로 전송합니다
 * - Worker가 없으면 버퍼에 추가하고 버퍼가 가득 차면 전송합니다
 * - 버퍼 크기가 0이면 무시됩니다
 */
export function enqueueDebugLog(entry: DebugLogEntry): void {
  // 로깅이 비활성화되어 있으면 즉시 반환
  if (!loggingEnabled) {
    return;
  }
  
  if (tryPostToWorker({ type: 'log', entry })) {
    return;
  }
  if (bufferSize <= 0) return;
  if (bufferSize <= 1) {
    void sendBatch([entry]);
    return;
  }

  buffer.push(entry);
  if (buffer.length >= bufferSize) {
    void flush();
    return;
  }

  scheduleFlush();
}

/**
 * 유휴 상태에서 버퍼를 비우기 위한 타이머를 설정합니다
 */
function scheduleFlush(): void {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
  }
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, IDLE_FLUSH_MS);
}

/**
 * 버퍼에 있는 로그들을 전송합니다
 */
async function flush(): Promise<void> {
  if (isFlushing || buffer.length === 0) return;
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  isFlushing = true;
  const batch = buffer;
  buffer = [];
  try {
    await sendBatch(batch);
  } finally {
    isFlushing = false;
    if (buffer.length >= bufferSize) {
      void flush();
    }
  }
}

/**
 * 여러 로그 엔트리를 일괄 전송합니다
 * 
 * @param entries - 전송할 로그 엔트리 배열
 * 
 * @remarks
 * - 단일 엔트리는 개별 전송 함수를 사용합니다
 * - 일괄 전송이 실패하면 개별 전송으로 폴백합니다
 */
async function sendBatch(entries: DebugLogEntry[]): Promise<void> {
  if (entries.length === 0) return;
  if (entries.length === 1) {
    await sendEntry(entries[0]);
    return;
  }

  try {
    const response = await fetch(INGEST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batch: entries }),
    });
    if (!response.ok) {
      throw new Error('Batch ingest failed');
    }
  } catch {
    for (const entry of entries) {
      try {
        await sendEntry(entry);
      } catch {
        // 로깅 실패는 무시합니다
      }
    }
  }
}

/**
 * 단일 로그 엔트리를 전송합니다
 * 
 * @param entry - 전송할 로그 엔트리
 * 
 * @remarks
 * - 전송 실패 시 에러를 무시합니다 (로깅 시스템의 실패가 앱 동작에 영향을 주지 않도록)
 */
async function sendEntry(entry: DebugLogEntry): Promise<void> {
  try {
    await fetch(INGEST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
  } catch {
    // 로깅 실패는 무시합니다
  }
}

/**
 * Worker와 통신하기 위한 메시지 타입
 */
type DebugWorkerMessage =
  | { type: 'setBufferSize'; size: number }
  | { type: 'log'; entry: DebugLogEntry };

/**
 * Worker로 메시지를 전송합니다
 * 
 * @param message - 전송할 메시지
 * @returns Worker로 전송 성공 여부
 * 
 * @remarks
 * - Worker가 없거나 실패한 경우 false를 반환합니다
 * - Worker 생성에 실패하면 이후 호출에서도 false를 반환합니다
 */
function tryPostToWorker(message: DebugWorkerMessage): boolean {
  if (workerFailed || typeof Worker === 'undefined') {
    return false;
  }

  if (!worker) {
    try {
      worker = new Worker(new URL('../workers/debugLogger.worker.ts', import.meta.url), { type: 'module' });
      worker.onerror = () => {
        workerFailed = true;
        worker = null;
      };
    } catch {
      workerFailed = true;
      worker = null;
      return false;
    }
  }

  if (!worker) {
    return false;
  }

  try {
    worker.postMessage(message);
    return true;
  } catch {
    workerFailed = true;
    worker = null;
    return false;
  }
}

/**
 * debugLogger Worker를 종료하고 리소스를 정리합니다.
 * 
 * @remarks
 * - Worker 인스턴스를 종료합니다 (`worker.terminate()`)
 * - 버퍼에 남은 로그를 전송합니다 (선택적)
 * - 타이머를 정리합니다
 * - 페이지 전환 또는 앱 종료 시 호출해야 합니다
 * 
 * @param flushBuffer - 종료 전 버퍼에 남은 로그를 전송할지 여부 (기본값: true)
 */
export async function terminateDebugLoggerWorker(flushBuffer = true): Promise<void> {
  // 버퍼에 남은 로그 전송 (선택적)
  if (flushBuffer && buffer.length > 0) {
    await flush();
  }
  
  // 타이머 정리
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  
  // Worker 종료
  if (worker) {
    try {
      worker.terminate();
    } catch (error) {
      console.warn('[debugLogger] Error terminating worker:', error);
    }
    worker = null;
  }
  
  // 상태 초기화
  buffer = [];
  isFlushing = false;
  
  // 실패 플래그 리셋 (다음에 다시 생성 가능하도록)
  workerFailed = false;
}