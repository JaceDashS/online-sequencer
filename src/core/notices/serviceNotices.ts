/**
 * jace-s 서비스 상태·공지 조회
 *
 * 계약: jace-s 저장소 docs/api/apps/online-sequencer/20-health.md
 * - GET {apiOrigin}/health          : 서버 생존 확인. 200이면 연결됨, 그 외는 연결 불가. 본문은 읽지 않는다.
 * - GET {apiOrigin}/notices?app=41  : 공지 목록. 200이 아니거나 형식이 다르면 공지 없음.
 * 두 요청 모두 쿠키 없이, 타임아웃 10초로 앱 진입 때 한 번만 보낸다.
 */

import type { ITransport } from '../../transport/types';

export const SERVICE_REQUEST_TIMEOUT_MS = 10_000;
export const NOTICE_AUTO_DISMISS_MS = 8_000;
export const OUTAGE_MESSAGE = 'Unable to connect to the server.';
export const NOTICES_SCHEMA_VERSION = 1;

export interface ServiceAnnouncement {
  id: string;
  title: string;
}

export interface ServiceStatusSnapshot {
  connected: boolean;
  announcements: ServiceAnnouncement[];
}

export interface ServiceNoticeToast {
  /** React key 겸 닫기 식별자 */
  key: string;
  kind: 'notice' | 'outage';
  text: string;
  role: 'status' | 'alert';
  /** null이면 사용자가 닫을 때까지 유지 */
  autoDismissMs: number | null;
}

type Fetcher = Pick<ITransport, 'request'>;

/**
 * 타임아웃과 함께 요청합니다. Electron transport는 signal을 무시하므로 타이머 경쟁도 함께 사용합니다.
 */
async function requestWithTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('timeout'));
    }, timeoutMs);
  });
  try {
    return await Promise.race([run(controller.signal), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * 서버 생존 확인. 200만 연결됨으로 판단하며 본문은 읽지 않습니다.
 */
export async function checkServiceHealth(
  transport: Fetcher,
  apiOrigin: string,
  timeoutMs = SERVICE_REQUEST_TIMEOUT_MS
): Promise<boolean> {
  try {
    const response = await requestWithTimeout(
      (signal) =>
        transport.request({
          url: `${apiOrigin}/health`,
          method: 'GET',
          credentials: 'omit',
          cache: 'no-store',
          signal,
        }),
      timeoutMs
    );
    return response.status === 200;
  } catch {
    return false;
  }
}

/**
 * /notices 응답 본문을 검증해 공지 목록으로 변환합니다.
 * 형식이 다르면 빈 배열(공지 없음)을 반환합니다.
 * 예전 형식(content 등 추가 필드)이 섞여 있어도 id·title만 사용합니다.
 */
export function parseNoticesPayload(payload: unknown): ServiceAnnouncement[] {
  if (!payload || typeof payload !== 'object') return [];
  const body = payload as { schemaVersion?: unknown; announcements?: unknown };
  if (body.schemaVersion !== NOTICES_SCHEMA_VERSION) return [];
  if (!Array.isArray(body.announcements)) return [];

  const result: ServiceAnnouncement[] = [];
  const seen = new Set<string>();
  for (const item of body.announcements) {
    if (!item || typeof item !== 'object') continue;
    const { id, title } = item as { id?: unknown; title?: unknown };
    if ((typeof id !== 'string' && typeof id !== 'number') || typeof title !== 'string') continue;
    const normalizedId = String(id);
    const normalizedTitle = title.trim();
    if (!normalizedId || !normalizedTitle || seen.has(normalizedId)) continue;
    seen.add(normalizedId);
    result.push({ id: normalizedId, title: normalizedTitle });
  }
  return result;
}

/**
 * 공지 목록 조회. 실패하면 공지 없음(빈 배열)이며 연결 상태에는 영향을 주지 않습니다.
 */
export async function fetchServiceNotices(
  transport: Fetcher,
  apiOrigin: string,
  appId: number,
  timeoutMs = SERVICE_REQUEST_TIMEOUT_MS
): Promise<ServiceAnnouncement[]> {
  try {
    return await requestWithTimeout(async (signal) => {
      const response = await transport.request({
        url: `${apiOrigin}/notices?app=${encodeURIComponent(String(appId))}`,
        method: 'GET',
        credentials: 'omit',
        cache: 'no-store',
        signal,
      });
      if (response.status !== 200) return [];
      return parseNoticesPayload(await response.json());
    }, timeoutMs);
  } catch {
    return [];
  }
}

/**
 * 연결 상태와 공지로 표시할 토스트를 결정합니다.
 * - 연결됨: 공지 토스트를 순서대로, 각 8초 뒤 자동으로 닫힘
 * - 연결 불가 + 공지 있음: 공지 토스트만, 닫을 때까지 유지 (장애 문구 없음)
 * - 연결 불가 + 공지 없음: 장애 문구 토스트 하나, 닫을 때까지 유지
 */
export function resolveServiceNoticeToasts(snapshot: ServiceStatusSnapshot): ServiceNoticeToast[] {
  if (snapshot.announcements.length > 0) {
    return snapshot.announcements.map((announcement) => ({
      key: `notice:${announcement.id}`,
      kind: 'notice',
      text: announcement.title,
      role: 'status',
      autoDismissMs: snapshot.connected ? NOTICE_AUTO_DISMISS_MS : null,
    }));
  }
  if (snapshot.connected) return [];
  return [
    {
      key: 'outage',
      kind: 'outage',
      text: OUTAGE_MESSAGE,
      role: 'alert',
      autoDismissMs: null,
    },
  ];
}

/**
 * /health와 /notices를 동시에 한 번씩 조회합니다.
 */
export async function loadServiceStatus(
  transport: Fetcher,
  apiOrigin: string,
  appId: number | null,
  timeoutMs = SERVICE_REQUEST_TIMEOUT_MS
): Promise<ServiceStatusSnapshot> {
  // 앱 ID가 설정되지 않으면 공지는 조회하지 않고(공지 없음) 생존 확인만 한다
  const [connected, announcements] = await Promise.all([
    checkServiceHealth(transport, apiOrigin, timeoutMs),
    appId === null ? Promise.resolve([]) : fetchServiceNotices(transport, apiOrigin, appId, timeoutMs),
  ]);
  return { connected, announcements };
}
