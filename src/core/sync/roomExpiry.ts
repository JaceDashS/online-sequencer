/**
 * 방 만료 시각 표시
 *
 * 계약: 방 유지 시간은 서버가 정한다(로그인 6시간, 비로그인 1시간). 클라이언트는 고정 시간을 가정하지 않고
 * 응답의 expiresAt을 그대로 표시한다.
 */

export interface RoomExpiryDisplay {
  /** 예: "Expires at 14:35" */
  label: string;
  /** 예: "58 min left", "1 h 5 min left", "Expired" */
  remaining: string;
  expired: boolean;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatRoomExpiry(expiresAt: number | null, now: number = Date.now()): RoomExpiryDisplay | null {
  if (expiresAt === null || !Number.isFinite(expiresAt)) return null;

  const date = new Date(expiresAt);
  const label = `Expires at ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const remainingMs = expiresAt - now;
  if (remainingMs <= 0) {
    return { label, remaining: 'Expired', expired: true };
  }

  const totalMinutes = Math.max(1, Math.ceil(remainingMs / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const remaining = hours > 0
    ? `${hours} h${minutes > 0 ? ` ${minutes} min` : ''} left`
    : `${minutes} min left`;
  return { label, remaining, expired: false };
}
