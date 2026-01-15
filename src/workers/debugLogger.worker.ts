interface DebugLogEntry {
  location: string;
  message: string;
  data?: Record<string, unknown>;
  timestamp: number;
  sessionId?: string;
  runId?: string;
  hypothesisId?: string;
}

type DebugWorkerMessage =
  | { type: 'setBufferSize'; size: number }
  | { type: 'log'; entry: DebugLogEntry };

const INGEST_URL = 'http://127.0.0.1:7242/ingest/870903ce-f6b4-4dbe-9e94-841bab6b23ed';
const DEFAULT_BUFFER_SIZE = 0;
const IDLE_FLUSH_MS = 4000;

let bufferSize = DEFAULT_BUFFER_SIZE;
let buffer: DebugLogEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let isFlushing = false;

self.onmessage = (event: MessageEvent<DebugWorkerMessage>) => {
  const message = event.data;
  if (!message) return;

  if (message.type === 'setBufferSize') {
    const nextSize = Number.isFinite(message.size) ? Math.max(0, Math.floor(message.size)) : DEFAULT_BUFFER_SIZE;
    bufferSize = nextSize;
    if (bufferSize === 0) {
      buffer = [];
      clearFlushTimer();
      return;
    }
    if (buffer.length >= bufferSize) {
      void flush();
    }
    return;
  }

  if (message.type === 'log') {
    enqueue(message.entry);
  }
};

function enqueue(entry: DebugLogEntry): void {
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

function scheduleFlush(): void {
  clearFlushTimer();
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, IDLE_FLUSH_MS);
}

function clearFlushTimer(): void {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}

async function flush(): Promise<void> {
  if (isFlushing || buffer.length === 0 || bufferSize <= 0) return;
  clearFlushTimer();
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
        // Ignore logging failures.
      }
    }
  }
}

async function sendEntry(entry: DebugLogEntry): Promise<void> {
  try {
    await fetch(INGEST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
  } catch {
    // Ignore logging failures.
  }
}
