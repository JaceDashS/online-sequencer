/**
 * 호스트 토큰 보관 (브라우저 sessionStorage)
 *
 * - 로그인 여부와 관계없이 클라이언트에만 보관한다. 서버 측 복구 기능은 없다.
 * - sessionStorage: 같은 탭에서는 새로고침 후에도 유지되고, 탭을 닫으면 사라지며, 다른 탭과 공유하지 않는다.
 * - 새로고침 후 자동으로 방을 되살리지 않는다. 사용자가 다시 호스팅을 시작하면
 *   보관한 토큰으로 기존 방 재등록을 시도한다(서버 계약: 재등록은 생성 제한에서 제외, 만료 시각 유지).
 * - 방 삭제·명시적 종료·방 종료/만료 이벤트·만료 시각 경과 때 지운다.
 * - 토큰은 URL이나 로그에 넣지 않는다.
 */

const STORAGE_KEY = 'online-sequencer-host-room';

export interface StoredHostRoom {
  hostId: string;
  roomCode: string;
  hostToken: string;
  /** 방 만료 시각 (epoch ms). 알 수 없으면 null */
  expiresAt: number | null;
}

function getStorage(): Storage | null {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  } catch {
    return null;
  }
}

function isValid(value: unknown): value is StoredHostRoom {
  if (!value || typeof value !== 'object') return false;
  const room = value as Partial<StoredHostRoom>;
  return typeof room.hostId === 'string'
    && typeof room.roomCode === 'string'
    && typeof room.hostToken === 'string' && room.hostToken.length > 0
    && (room.expiresAt === null || typeof room.expiresAt === 'number');
}

/**
 * 같은 hostId의 유효한(만료 전) 보관 정보를 읽습니다. 만료됐거나 형식이 다르면 지우고 null을 반환합니다.
 */
export function loadHostRoom(hostId: string, now: number = Date.now()): StoredHostRoom | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isValid(parsed) || (parsed.expiresAt !== null && parsed.expiresAt <= now)) {
      storage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed.hostId === hostId ? parsed : null;
  } catch {
    return null;
  }
}

export function saveHostRoom(room: StoredHostRoom): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(room));
  } catch {
    // 저장 공간 부족·차단: 메모리 토큰만 사용
  }
}

export function clearHostRoom(): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // 무시
  }
}

/**
 * 보관한 방과 roomCode가 같을 때만 지웁니다. (참가자로 다른 방에 있을 때 받은 종료 이벤트로 지우지 않도록)
 */
export function clearHostRoomIfMatches(roomCode: string | undefined): boolean {
  const storage = getStorage();
  if (!storage || !roomCode) return false;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const parsed: unknown = JSON.parse(raw);
    if (isValid(parsed) && parsed.roomCode === roomCode) {
      storage.removeItem(STORAGE_KEY);
      return true;
    }
  } catch {
    // 무시
  }
  return false;
}
