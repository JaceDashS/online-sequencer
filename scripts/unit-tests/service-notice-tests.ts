import assert from 'node:assert/strict';

import {
  checkServiceHealth,
  fetchServiceNotices,
  loadServiceStatus,
  NOTICE_AUTO_DISMISS_MS,
  OUTAGE_MESSAGE,
  parseNoticesPayload,
  resolveServiceNoticeToasts,
} from '../../src/core/notices/serviceNotices';
import { getJaceSession, hasAdminAccess, parseAdminAccess, parseSessionPayload, refreshJaceSession, requestAdminApproval, withJaceAuth } from '../../src/core/auth/jaceSession';
import { SignalingClient } from '../../src/core/sync/SignalingClient';
import { createRoomApiError } from '../../src/core/sync/roomApiErrors';
import { formatRoomExpiry } from '../../src/core/sync/roomExpiry';
import { clearHostRoomIfMatches, loadHostRoom, saveHostRoom } from '../../src/core/sync/hostTokenStore';
import { resetTransport, setTransport } from '../../src/transport';
import { buildApiUrl, buildWebSocketUrl, getApiUrl, getNoticeAppId, getSiteUrl, isLoginAvailable } from '../../src/utils/apiConfig';
import type { IHttpRequestOptions, IHttpResponse, IWebSocket } from '../../src/transport/types';

type TestFn = () => void | Promise<void>;
const tests: Array<{ name: string; fn: TestFn }> = [];
function test(name: string, fn: TestFn): void {
  tests.push({ name, fn });
}

type Route = { status: number; body?: unknown; rawBody?: string } | 'network-error' | 'hang';

function createTransport(routes: Record<string, Route>) {
  const calls: IHttpRequestOptions[] = [];
  return {
    calls,
    async request(options: IHttpRequestOptions): Promise<IHttpResponse> {
      calls.push(options);
      const path = new URL(options.url).pathname + new URL(options.url).search;
      const route = routes[path];
      if (!route || route === 'network-error') throw new Error('network error');
      if (route === 'hang') return new Promise<IHttpResponse>(() => {});
      return {
        ok: route.status >= 200 && route.status < 300,
        status: route.status,
        json: async () => (route.rawBody !== undefined ? JSON.parse(route.rawBody) : route.body),
        text: async () => route.rawBody ?? JSON.stringify(route.body),
      };
    },
  };
}

const ORIGIN = 'https://api.jace-s.com';
const NOTICES_PATH = `/notices?app=${getNoticeAppId()}`;

console.log('Service notice unit tests\n');
console.log('='.repeat(60));

test('default addresses follow the api.jace-s.com contract (no /api prefix)', () => {
  assert.equal(getNoticeAppId(), 41);
  assert.equal(getApiUrl(), 'https://api.jace-s.com');
  assert.equal(getSiteUrl(), 'https://jace-s.com');
  assert.equal(buildApiUrl('/rooms'), 'https://api.jace-s.com/online-sequencer/rooms');
  assert.equal(buildApiUrl('rooms/1234/kick'), 'https://api.jace-s.com/online-sequencer/rooms/1234/kick');
  assert.equal(
    buildWebSocketUrl('/signaling', { clientId: 'abc' }),
    'wss://api.jace-s.com/online-sequencer/signaling?clientId=abc'
  );
});

test('health is connected only on 200 and never reads the body', async () => {
  let bodyRead = false;
  const transport = {
    async request(): Promise<IHttpResponse> {
      return {
        ok: true,
        status: 200,
        json: async () => { bodyRead = true; return {}; },
        text: async () => { bodyRead = true; return ''; },
      };
    },
  };
  assert.equal(await checkServiceHealth(transport, ORIGIN), true);
  assert.equal(bodyRead, false);

  assert.equal(await checkServiceHealth(createTransport({ '/health': { status: 503, body: {} } }), ORIGIN), false);
  assert.equal(await checkServiceHealth(createTransport({ '/health': { status: 204 } }), ORIGIN), false);
  assert.equal(await checkServiceHealth(createTransport({ '/health': 'network-error' }), ORIGIN), false);
});

test('health times out as disconnected', async () => {
  assert.equal(await checkServiceHealth(createTransport({ '/health': 'hang' }), ORIGIN, 20), false);
});

test('requests go to api origin without cookies', async () => {
  const transport = createTransport({ '/health': { status: 200 }, [NOTICES_PATH]: { status: 200, body: { schemaVersion: 1, announcements: [] } } });
  await loadServiceStatus(transport, ORIGIN, getNoticeAppId());
  const urls = transport.calls.map((call) => call.url).sort();
  assert.deepEqual(urls, [`${ORIGIN}/health`, `${ORIGIN}/notices?app=41`]);
  for (const call of transport.calls) {
    assert.equal(call.credentials, 'omit');
    assert.equal(call.method, 'GET');
  }
});

test('notices payload keeps only id and title in order', () => {
  const parsed = parseNoticesPayload({
    schemaVersion: 1,
    announcements: [
      { id: 'n1', title: '오늘 밤 11시부터 30분간 점검합니다', content: 'legacy' },
      { id: 'n2', title: '<b>HTML은 텍스트로</b>' },
      { id: 'n3' },
      { id: 'n1', title: 'duplicate' },
      { id: 7, title: ' 숫자 ID ' },
    ],
    noticeRevision: 'r',
  });
  assert.deepEqual(parsed, [
    { id: 'n1', title: '오늘 밤 11시부터 30분간 점검합니다' },
    { id: 'n2', title: '<b>HTML은 텍스트로</b>' },
    { id: '7', title: '숫자 ID' },
  ]);
});

test('notices with unknown schema or shape are treated as none', () => {
  assert.deepEqual(parseNoticesPayload({ schemaVersion: 2, announcements: [{ id: 'a', title: 'b' }] }), []);
  assert.deepEqual(parseNoticesPayload({ schemaVersion: 1, announcements: 'x' }), []);
  assert.deepEqual(parseNoticesPayload(null), []);
});

test('notices failures give no announcements', async () => {
  assert.deepEqual(await fetchServiceNotices(createTransport({ [NOTICES_PATH]: { status: 500, body: {} } }), ORIGIN, 41), []);
  assert.deepEqual(await fetchServiceNotices(createTransport({ [NOTICES_PATH]: { status: 200, rawBody: '{oops' } }), ORIGIN, 41), []);
  assert.deepEqual(await fetchServiceNotices(createTransport({ [NOTICES_PATH]: 'network-error' }), ORIGIN, 41), []);
  assert.deepEqual(await fetchServiceNotices(createTransport({ [NOTICES_PATH]: 'hang' }), ORIGIN, 41, 20), []);
});

test('handoff case: health down + notices -> notice toasts only, persistent', async () => {
  const transport = createTransport({
    '/health': 'network-error',
    [NOTICES_PATH]: { status: 200, body: { schemaVersion: 1, announcements: [{ id: 'n1', title: '오늘 밤 11시부터 30분간 점검합니다' }] } },
  });
  const toasts = resolveServiceNoticeToasts(await loadServiceStatus(transport, ORIGIN, 41));
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].kind, 'notice');
  assert.equal(toasts[0].autoDismissMs, null);
  assert.ok(toasts.every((toast) => toast.text !== OUTAGE_MESSAGE));
});

test('handoff case: health down + notices down -> one outage toast', async () => {
  const transport = createTransport({ '/health': 'network-error', [NOTICES_PATH]: 'network-error' });
  const toasts = resolveServiceNoticeToasts(await loadServiceStatus(transport, ORIGIN, 41));
  assert.deepEqual(toasts, [{ key: 'outage', kind: 'outage', text: OUTAGE_MESSAGE, role: 'alert', autoDismissMs: null }]);
});

test('handoff case: health 200 + notice -> auto dismiss after 8s with role status', async () => {
  const transport = createTransport({
    '/health': { status: 200 },
    [NOTICES_PATH]: { status: 200, body: { schemaVersion: 1, announcements: [{ id: 'n1', title: '공지' }] } },
  });
  const toasts = resolveServiceNoticeToasts(await loadServiceStatus(transport, ORIGIN, 41));
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].role, 'status');
  assert.equal(toasts[0].autoDismissMs, NOTICE_AUTO_DISMISS_MS);
  assert.equal(NOTICE_AUTO_DISMISS_MS, 8000);
});

test('health 200 without notices shows nothing', () => {
  assert.deepEqual(resolveServiceNoticeToasts({ connected: true, announcements: [] }), []);
});

test('session payload reads user, isAdmin and a nullable csrfToken', () => {
  const parsed = parseSessionPayload({ user: { name: 'a' }, csrfToken: 't', isAdmin: true, adminAccess: { rooms: 'read' } });
  assert.equal(parsed?.isAdmin, true);
  assert.equal(parsed?.csrfToken, 't');
  assert.equal(parsed?.adminAccess.rooms, 'read');
  assert.equal(parsed?.adminAccess.users, 'none');
  // 계약: csrfToken은 null일 수 있다 → 로그인 상태이지만 변경 요청에 쿠키·CSRF를 붙이지 않음
  const noCsrf = parseSessionPayload({ user: { name: 'a' }, csrfToken: null });
  assert.equal(noCsrf?.csrfToken, null);
  assert.equal(noCsrf?.isAdmin, false);
  assert.equal(parseSessionPayload({ csrfToken: 't' }), null);
  assert.equal(parseSessionPayload(null), null);
});

test('admin access follows jace-s levels (none < read < write) per menu', () => {
  const access = parseAdminAccess({ notices: 'write', rooms: 'read', users: 'none', monitor: 'bogus', extra: 'write' });
  assert.equal(access.notices, 'write');
  assert.equal(access.monitor, 'none');
  assert.equal((access as Record<string, string>).extra, undefined);
  const admin = { status: 'signed-in' as const, isAdmin: true, adminAccess: access };
  assert.equal(hasAdminAccess(admin, 'notices', 'write'), true);
  assert.equal(hasAdminAccess(admin, 'rooms', 'read'), true);
  assert.equal(hasAdminAccess(admin, 'rooms', 'write'), false);
  assert.equal(hasAdminAccess(admin, 'users'), false);
  // Usage 조회만 가능한 계정 예: isAdmin은 true지만 다른 메뉴는 false
  const usageOnly = { status: 'signed-in' as const, isAdmin: true, adminAccess: parseAdminAccess({ monitor: 'read' }) };
  assert.equal(hasAdminAccess(usageOnly, 'monitor'), true);
  assert.equal(hasAdminAccess(usageOnly, 'notices'), false);
  assert.equal(hasAdminAccess({ ...admin, status: 'signed-out' }, 'notices'), false);
  assert.equal(hasAdminAccess({ ...admin, isAdmin: false }, 'notices'), false);
});

test('login is only available on the allowed host', () => {
  assert.equal(isLoginAvailable({ protocol: 'https:', hostname: 'online-sequencer.jace-s.com' }), true);
  assert.equal(isLoginAvailable({ protocol: 'https:', hostname: 'online-sequencer.vercel.app' }), false);
  assert.equal(isLoginAvailable({ protocol: 'http:', hostname: 'localhost' }), false);
  assert.equal(isLoginAvailable({ protocol: 'file:', hostname: '' }), false);
});

test('withJaceAuth leaves requests unchanged where login is unavailable or signed out', () => {
  const options = { method: 'POST', headers: { 'X-Client-Id': 'c' } };
  assert.equal(withJaceAuth(options), options);
});

test('signed-in session adds credentials and x-csrf-token to mutating requests only', async () => {
  const g = globalThis as unknown as { window?: unknown };
  const previousWindow = g.window;
  g.window = { location: { protocol: 'https:', hostname: 'online-sequencer.jace-s.com' } };
  const transport = createTransport({ '/auth/session': { status: 200, body: { user: { name: 'tester' }, csrfToken: 'tok-1' } } });
  setTransport(transport);
  try {
    // 허용 Origin이지만 아직 로그인 확인 전: 비로그인처럼 요청을 바꾸지 않음
    const beforeLogin = { method: 'POST', headers: {} };
    assert.equal(withJaceAuth(beforeLogin), beforeLogin);

    await refreshJaceSession();
    assert.equal(getJaceSession().status, 'signed-in');
    assert.equal(transport.calls[0].url, 'https://api.jace-s.com/auth/session');
    assert.equal(transport.calls[0].credentials, 'include');

    const post = withJaceAuth({ method: 'POST', headers: { 'X-Client-Id': 'c' } });
    assert.equal(post.credentials, 'include');
    assert.deepEqual(post.headers, { 'X-Client-Id': 'c', 'x-csrf-token': 'tok-1' });

    const get = withJaceAuth({ method: 'GET', headers: {} });
    assert.equal(get.credentials, 'include');
    assert.deepEqual(get.headers, {});
  } finally {
    resetTransport();
    g.window = previousWindow;
    await refreshJaceSession(); // 로그인 불가 환경으로 상태 복원
  }
});

function createRoomTransport(responses: Array<{ status: number; body: unknown }>) {
  const calls: IHttpRequestOptions[] = [];
  const wsSent: Array<{ action: string; roomCode?: string; data?: { role?: string; hostToken?: string } }> = [];
  const queue = [...responses];
  const ws: IWebSocket = {
    readyState: 1,
    onopen: null,
    onmessage: null,
    onerror: null,
    onclose: null,
    send(data: string) {
      const message = JSON.parse(data) as { action: string; roomCode?: string; data?: { role?: string; hostToken?: string } };
      wsSent.push(message);
      if (message.action === 'register') {
        setTimeout(() => ws.onmessage?.({ data: JSON.stringify({ action: 'registered', roomCode: message.roomCode }) }), 0);
      }
    },
    close() {},
  };
  return {
    calls,
    wsSent,
    wsUrls: [] as string[],
    async request(options: IHttpRequestOptions): Promise<IHttpResponse> {
      calls.push(options);
      const next = queue.shift() ?? { status: 200, body: { success: true } };
      return {
        ok: next.status >= 200 && next.status < 300,
        status: next.status,
        json: async () => next.body,
        text: async () => JSON.stringify(next.body),
      };
    },
    async connectWebSocket(url: string): Promise<IWebSocket> {
      this.wsUrls.push(url);
      return ws;
    },
  };
}

test('host token from room creation is sent as Bearer and never in URLs', async () => {
  const transport = createRoomTransport([
    { status: 200, body: { success: true, roomCode: '0420', hostId: 'h', hostToken: 'secret-token', expiresAt: 1, allowJoin: false, createdAt: 0 } },
  ]);
  setTransport(transport);
  try {
    const client = new SignalingClient();
    const roomCode = await client.registerRoom('host-uuid');
    assert.equal(roomCode, '0420');
    assert.match(transport.wsUrls[0], /^wss:\/\/api\.jace-s\.com\/online-sequencer\/signaling\?clientId=/);

    const create = transport.calls[0];
    assert.equal(create.url, 'https://api.jace-s.com/online-sequencer/rooms');
    assert.equal(create.method, 'POST');
    assert.deepEqual(JSON.parse(create.body ?? '{}'), { hostId: 'host-uuid' });
    assert.equal(create.headers?.Authorization, undefined);
    assert.deepEqual(transport.wsSent[0].data, { role: 'host', hostToken: 'secret-token' });

    await client.allowJoin(roomCode, 99999);
    await client.kickParticipant(roomCode, 'guest-1');
    await client.getRoom(roomCode);
    await client.deleteRoom(roomCode);

    const [, allow, kick, get, del] = transport.calls;
    assert.equal(allow.url, 'https://api.jace-s.com/online-sequencer/rooms/0420/allow-join');
    assert.equal(allow.headers?.Authorization, 'Bearer secret-token');
    assert.deepEqual(JSON.parse(allow.body ?? '{}'), { duration: 3600 });
    assert.equal(kick.url, 'https://api.jace-s.com/online-sequencer/rooms/0420/kick');
    assert.equal(kick.headers?.Authorization, 'Bearer secret-token');
    assert.deepEqual(JSON.parse(kick.body ?? '{}'), { participantId: 'guest-1' });
    assert.equal(get.method, 'GET');
    assert.equal(get.headers?.Authorization, undefined);
    assert.ok(get.headers?.['x-client-id']);
    assert.equal(del.method, 'DELETE');
    assert.equal(del.headers?.Authorization, 'Bearer secret-token');
    for (const call of transport.calls) {
      assert.ok(!call.url.includes('secret-token'));
      assert.ok(!call.url.includes('/api/'));
      assert.equal(call.credentials, undefined);
    }
  } finally {
    resetTransport();
  }
});

test('re-registration uses the stored host token and falls back to a new room when rejected', async () => {
  const transport = createRoomTransport([
    { status: 200, body: { success: true, roomCode: '1111', hostToken: 'token-1' } },
    { status: 401, body: { success: false, error: 'INVALID_HOST_TOKEN' } },
    { status: 200, body: { success: true, roomCode: '2222', hostToken: 'token-2' } },
  ]);
  setTransport(transport);
  try {
    const client = new SignalingClient();
    assert.equal(await client.registerRoom('host-uuid'), '1111');
    assert.equal(await client.registerRoom('host-uuid'), '2222');
    assert.equal(transport.calls[1].headers?.Authorization, 'Bearer token-1');
    assert.equal(transport.calls[2].headers?.Authorization, undefined);
    // 재등록 성공 응답의 hostToken=null은 기존 토큰을 덮어쓰지 않음 → 새 방 token-2로 WS register
    assert.equal(transport.wsSent[1].data?.hostToken, 'token-2');
    await client.deleteRoom('2222');
    assert.equal(transport.calls[3].headers?.Authorization, 'Bearer token-2');
  } finally {
    resetTransport();
  }
});

test('re-registration response with hostToken null keeps the stored token', async () => {
  const transport = createRoomTransport([
    { status: 200, body: { success: true, roomCode: '3333', hostToken: 'token-a' } },
    { status: 200, body: { success: true, roomCode: '3333', hostToken: null } },
  ]);
  setTransport(transport);
  const originalLog = console.log;
  const logged: string[] = [];
  console.log = (...args: unknown[]) => { logged.push(args.map(String).join(' ')); };
  try {
    const client = new SignalingClient();
    await client.registerRoom('host-uuid');
    await client.registerRoom('host-uuid');
    assert.equal(transport.calls[1].headers?.Authorization, 'Bearer token-a');
    assert.equal(transport.wsSent[1].data?.hostToken, 'token-a');
    await client.deleteRoom('3333');
    assert.equal(transport.calls[2].headers?.Authorization, 'Bearer token-a');
    assert.ok(logged.every((line) => !line.includes('token-a')));
  } finally {
    console.log = originalLog;
    resetTransport();
  }
});

test('room API errors map contract codes to readable messages', () => {
  const active = createRoomApiError(409, { success: false, error: 'ACTIVE_ROOM_LIMIT' } as never, 'Failed');
  assert.equal(active.code, 'ACTIVE_ROOM_LIMIT');
  assert.match(active.message, /already have an active room/);
  assert.equal(createRoomApiError(429, { error: 'RATE_LIMITED' }, 'Failed').code, 'RATE_LIMITED');
  assert.equal(createRoomApiError(404, { error: 'Not found', code: 'ROOM_NOT_FOUND' }, 'Failed').message, 'Room not found');
  assert.equal(createRoomApiError(502, null, 'Failed to create room').message, 'Failed to create room (HTTP 502)');
  assert.equal(createRoomApiError(400, { error: 'Something odd' }, 'Failed').message, 'Something odd');
});

test('rejected creation surfaces ACTIVE_ROOM_LIMIT to the caller', async () => {
  const transport = createRoomTransport([{ status: 409, body: { success: false, error: 'ACTIVE_ROOM_LIMIT' } }]);
  setTransport(transport);
  const originalError = console.error;
  console.error = () => {};
  try {
    const client = new SignalingClient();
    await assert.rejects(() => client.registerRoom('host-uuid'), /already have an active room/);
    assert.equal(transport.calls.length, 1);
  } finally {
    console.error = originalError;
    resetTransport();
  }
});

function installSessionStorage(): { store: Map<string, string>; restore: () => void } {
  const g = globalThis as unknown as { sessionStorage?: unknown };
  const previous = g.sessionStorage;
  const store = new Map<string, string>();
  g.sessionStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
  };
  return { store, restore: () => { g.sessionStorage = previous; } };
}

test('host token survives a reload in the same tab via sessionStorage', async () => {
  const session = installSessionStorage();
  const transport = createRoomTransport([
    { status: 200, body: { success: true, roomCode: '0777', hostToken: 'tab-token', expiresAt: Date.now() + 3600_000 } },
    { status: 200, body: { success: true, roomCode: '0777', hostToken: null, expiresAt: Date.now() + 3600_000 } },
  ]);
  setTransport(transport);
  try {
    const before = new SignalingClient();
    await before.registerRoom('host-uuid');
    assert.equal(loadHostRoom('host-uuid')?.hostToken, 'tab-token');

    // 새로고침: 메모리 상태가 없는 새 인스턴스. 자동 복구는 없고, 다시 호스팅할 때 보관 토큰으로 재등록
    const after = new SignalingClient();
    assert.equal(await after.registerRoom('host-uuid'), '0777');
    assert.equal(transport.calls[1].headers?.Authorization, 'Bearer tab-token');
    assert.equal(transport.wsSent[1].data?.hostToken, 'tab-token');
    assert.equal(loadHostRoom('host-uuid')?.hostToken, 'tab-token');

    await after.deleteRoom('0777');
    assert.equal(transport.calls[2].headers?.Authorization, 'Bearer tab-token');
    assert.equal(loadHostRoom('host-uuid'), null);
  } finally {
    resetTransport();
    session.restore();
  }
});

test('stored host room is ignored after expiry, for another hostId, and cleared on matching close', () => {
  const session = installSessionStorage();
  try {
    saveHostRoom({ hostId: 'a', roomCode: '0001', hostToken: 't', expiresAt: 1000 });
    assert.equal(loadHostRoom('a', 999)?.roomCode, '0001');
    assert.equal(loadHostRoom('b', 999), null);
    assert.equal(loadHostRoom('a', 1000), null);
    assert.equal(session.store.size, 0);

    saveHostRoom({ hostId: 'a', roomCode: '0002', hostToken: 't', expiresAt: null });
    assert.equal(clearHostRoomIfMatches('9999'), false);
    assert.equal(clearHostRoomIfMatches('0002'), true);
    assert.equal(loadHostRoom('a'), null);
  } finally {
    session.restore();
  }
});

test('rejected stored token is cleared and a new room is created', async () => {
  const session = installSessionStorage();
  saveHostRoom({ hostId: 'host-uuid', roomCode: '0101', hostToken: 'stale', expiresAt: null });
  const transport = createRoomTransport([
    { status: 404, body: { success: false, error: 'ROOM_NOT_FOUND' } },
    { status: 200, body: { success: true, roomCode: '0202', hostToken: 'fresh', expiresAt: Date.now() + 3600_000 } },
  ]);
  setTransport(transport);
  const originalError = console.error;
  console.error = () => {};
  try {
    const client = new SignalingClient();
    assert.equal(await client.registerRoom('host-uuid'), '0202');
    assert.equal(transport.calls[0].headers?.Authorization, 'Bearer stale');
    assert.equal(transport.calls[1].headers?.Authorization, undefined);
    assert.equal(loadHostRoom('host-uuid')?.hostToken, 'fresh');
  } finally {
    console.error = originalError;
    resetTransport();
    session.restore();
  }
});

function createScriptedTransport(script: Array<{ match: string; status: number; body: unknown }>) {
  const calls: IHttpRequestOptions[] = [];
  const base = createRoomTransport([]);
  return {
    ...base,
    calls,
    async request(options: IHttpRequestOptions): Promise<IHttpResponse> {
      calls.push(options);
      const path = new URL(options.url).pathname;
      const index = script.findIndex((step) => step.match === path);
      const step = index >= 0 ? script.splice(index, 1)[0] : { status: 500, body: {} };
      return {
        ok: step.status >= 200 && step.status < 300,
        status: step.status,
        json: async () => step.body,
        text: async () => JSON.stringify(step.body),
      };
    },
  };
}

async function withSignedInWindow(fn: () => Promise<void>): Promise<void> {
  const g = globalThis as unknown as { window?: unknown };
  const previousWindow = g.window;
  g.window = { location: { protocol: 'https:', hostname: 'online-sequencer.jace-s.com' } };
  const originalError = console.error;
  console.error = () => {};
  try {
    await fn();
  } finally {
    console.error = originalError;
    resetTransport();
    g.window = previousWindow;
    await refreshJaceSession();
  }
}

test('CSRF failure on room creation refreshes the session and retries once with the new token', async () => {
  await withSignedInWindow(async () => {
    const transport = createScriptedTransport([
      { match: '/auth/session', status: 200, body: { user: { name: 'u' }, csrfToken: 'old' } },
      { match: '/online-sequencer/rooms', status: 403, body: { success: false, error: 'CSRF_VALIDATION_FAILED' } },
      { match: '/auth/session', status: 200, body: { user: { name: 'u' }, csrfToken: 'new' } },
      { match: '/online-sequencer/rooms', status: 200, body: { success: true, roomCode: '0505', hostToken: 'h' } },
    ]);
    setTransport(transport);
    await refreshJaceSession();
    const client = new SignalingClient();
    assert.equal(await client.registerRoom('host-uuid'), '0505');
    const posts = transport.calls.filter((call) => call.method === 'POST');
    assert.equal(posts.length, 2);
    assert.equal(posts[0].headers?.['x-csrf-token'], 'old');
    assert.equal(posts[1].headers?.['x-csrf-token'], 'new');
    assert.equal(posts[1].credentials, 'include');
  });
});

test('CSRF retry after an expired session goes out as a signed-out request', async () => {
  await withSignedInWindow(async () => {
    const transport = createScriptedTransport([
      { match: '/auth/session', status: 200, body: { user: { name: 'u' }, csrfToken: 'old' } },
      { match: '/online-sequencer/rooms', status: 403, body: { success: false, error: 'CSRF_VALIDATION_FAILED' } },
      { match: '/auth/session', status: 401, body: {} },
      { match: '/online-sequencer/rooms', status: 200, body: { success: true, roomCode: '0606', hostToken: 'h' } },
    ]);
    setTransport(transport);
    await refreshJaceSession();
    const client = new SignalingClient();
    assert.equal(await client.registerRoom('host-uuid'), '0606');
    const retry = transport.calls.filter((call) => call.method === 'POST')[1];
    assert.equal(retry.headers?.['x-csrf-token'], undefined);
    assert.equal(retry.credentials, undefined);
    assert.equal(getJaceSession().status, 'signed-out');
  });
});

test('CSRF retry happens only once', async () => {
  await withSignedInWindow(async () => {
    const transport = createScriptedTransport([
      { match: '/auth/session', status: 200, body: { user: {}, csrfToken: 'a' } },
      { match: '/online-sequencer/rooms', status: 403, body: { success: false, error: 'CSRF_VALIDATION_FAILED' } },
      { match: '/auth/session', status: 200, body: { user: {}, csrfToken: 'b' } },
      { match: '/online-sequencer/rooms', status: 403, body: { success: false, error: 'CSRF_VALIDATION_FAILED' } },
    ]);
    setTransport(transport);
    await refreshJaceSession();
    const client = new SignalingClient();
    await assert.rejects(() => client.registerRoom('host-uuid'), /sign-in session could not be verified/);
    assert.equal(transport.calls.filter((call) => call.method === 'POST').length, 2);
  });
});

test('room expiry is formatted from the server expiresAt', () => {
  const now = new Date(2026, 10, 3, 13, 37, 0).getTime();
  const oneHour = formatRoomExpiry(now + 58 * 60_000 + 10_000, now);
  assert.equal(oneHour?.label, 'Expires at 14:35');
  assert.equal(oneHour?.remaining, '59 min left');
  assert.equal(formatRoomExpiry(now + 6 * 3600_000, now)?.remaining, '6 h left');
  assert.equal(formatRoomExpiry(now + 65 * 60_000, now)?.remaining, '1 h 5 min left');
  assert.equal(formatRoomExpiry(now + 1000, now)?.remaining, '1 min left');
  assert.deepEqual(formatRoomExpiry(now - 1, now)?.expired, true);
  assert.equal(formatRoomExpiry(null, now), null);
});

test('signaling client exposes expiresAt from creation and keeps it on re-registration without one', async () => {
  const transport = createRoomTransport([
    { status: 200, body: { success: true, roomCode: '0909', hostToken: 't', expiresAt: 1_900_000_000_000 } },
  ]);
  setTransport(transport);
  try {
    const client = new SignalingClient();
    await client.registerRoom('host-uuid');
    assert.equal(client.getRoomExpiresAt(), 1_900_000_000_000);
    await client.deleteRoom('0909');
    assert.equal(client.getRoomExpiresAt(), null);
  } finally {
    resetTransport();
  }
});

test('admin approval re-checks the server session before every action', async () => {
  await withSignedInWindow(async () => {
    const transport = createScriptedTransport([
      { match: '/auth/session', status: 200, body: { user: {}, isAdmin: true, adminAccess: { monitor: 'read' }, csrfToken: 'c' } },
      { match: '/auth/session', status: 200, body: { user: {}, isAdmin: true, adminAccess: { users: 'write' }, csrfToken: 'c' } },
      { match: '/auth/session', status: 401, body: {} },
      { match: '/auth/session', status: 500, body: {} },
    ]);
    setTransport(transport);
    assert.deepEqual(await requestAdminApproval('monitor', 'read'), { approved: true, via: 'server' });
    // 권한 회수 즉시 반영
    assert.deepEqual(await requestAdminApproval('monitor', 'read'), { approved: false, reason: 'forbidden' });
    assert.deepEqual(await requestAdminApproval('monitor', 'read'), { approved: false, reason: 'signed-out' });
    assert.deepEqual(await requestAdminApproval('monitor', 'read'), { approved: false, reason: 'unreachable' });
    assert.equal(transport.calls.filter((call) => call.url.endsWith('/auth/session')).length, 4);
  });
});

test('admin approval is denied where login is unavailable outside the local dev server', async () => {
  const result = await requestAdminApproval('monitor', 'read');
  assert.deepEqual(result, { approved: false, reason: 'signed-out' });
});

(async () => {
  let pass = 0;
  let fail = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      pass += 1;
      console.log(`PASS ${name}`);
    } catch (error) {
      fail += 1;
      console.error(`FAIL ${name}`);
      console.error(`  ${(error as Error).message}`);
    }
  }
  console.log('='.repeat(60));
  console.log(`Total: ${tests.length}, Passed: ${pass}, Failed: ${fail}`);
  if (fail > 0) process.exit(1);
})();
