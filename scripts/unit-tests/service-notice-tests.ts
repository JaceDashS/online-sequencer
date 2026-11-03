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
import { getJaceSession, parseSessionPayload, refreshJaceSession, withJaceAuth } from '../../src/core/auth/jaceSession';
import { SignalingClient } from '../../src/core/sync/SignalingClient';
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

test('session payload requires csrfToken', () => {
  assert.deepEqual(parseSessionPayload({ user: { name: 'a' }, csrfToken: 't' }), { user: { name: 'a' }, csrfToken: 't' });
  assert.equal(parseSessionPayload({ user: { name: 'a' } }), null);
  assert.equal(parseSessionPayload(null), null);
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
  const queue = [...responses];
  const ws: IWebSocket = {
    readyState: 1,
    onopen: null,
    onmessage: null,
    onerror: null,
    onclose: null,
    send(data: string) {
      const message = JSON.parse(data) as { action: string; roomCode?: string };
      if (message.action === 'register') {
        setTimeout(() => ws.onmessage?.({ data: JSON.stringify({ action: 'registered', roomCode: message.roomCode }) }), 0);
      }
    },
    close() {},
  };
  return {
    calls,
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
    await client.deleteRoom('2222');
    assert.equal(transport.calls[3].headers?.Authorization, 'Bearer token-2');
  } finally {
    resetTransport();
  }
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
