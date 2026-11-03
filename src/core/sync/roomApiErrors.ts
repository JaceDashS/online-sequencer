/**
 * Online Sequencer 방 API 에러 해석
 *
 * 계약: jace-s 저장소 docs/api/apps/online-sequencer/30-app-contract.md (Http Errors)
 * 에러 형식: {success:false, error:string, code?:string, details?:unknown}
 * 실패 응답이 JSON이 아닐 수 있으므로(프록시·인프라 오류) 본문이 없어도 처리한다.
 */

export interface RoomApiErrorBody {
  error?: unknown;
  code?: unknown;
}

const MESSAGES: Record<string, string> = {
  ACTIVE_ROOM_LIMIT: 'You already have an active room. Stop hosting it or wait until it expires before creating a new one.',
  RATE_LIMITED: 'Too many room requests. Please wait a while and try again.',
  CSRF_VALIDATION_FAILED: 'Your sign-in session could not be verified. Please reload the page and try again.',
  NO_AVAILABLE_ROOM_CODES: 'No room codes are available right now. Please try again later.',
  ROOM_NOT_FOUND: 'Room not found',
  KICKED: 'You have been kicked from this room',
  UNAUTHORIZED: 'Host authorization failed. Please start hosting again.',
  PARTICIPANT_NOT_FOUND: 'Participant not found',
  INVALID_ROOM_CODE: 'Invalid room code',
  INVALID_DURATION: 'Invalid allow-join duration',
};

export class RoomApiError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(status: number, code: string | null, message: string) {
    super(message);
    this.name = 'RoomApiError';
    this.status = status;
    this.code = code;
  }
}

/**
 * 에러 본문에서 코드를 고릅니다. code가 있으면 우선하고, 없으면 error 문자열을 코드로 봅니다.
 */
export function getRoomApiErrorCode(body: RoomApiErrorBody | null | undefined): string | null {
  if (!body) return null;
  if (typeof body.code === 'string' && body.code) return body.code;
  if (typeof body.error === 'string' && /^[A-Z_]+$/.test(body.error)) return body.error;
  return null;
}

export function createRoomApiError(
  status: number,
  body: RoomApiErrorBody | null | undefined,
  fallback: string
): RoomApiError {
  const code = getRoomApiErrorCode(body);
  const rawMessage = body && typeof body.error === 'string' && body.error ? body.error : null;
  const message = (code && MESSAGES[code]) || rawMessage || `${fallback} (HTTP ${status})`;
  return new RoomApiError(status, code, message);
}

/**
 * 응답 본문을 안전하게 읽어 RoomApiError를 만듭니다.
 */
export async function readRoomApiError(
  response: { status: number; json(): Promise<unknown> },
  fallback: string
): Promise<RoomApiError> {
  const body = (await response.json().catch(() => null)) as RoomApiErrorBody | null;
  return createRoomApiError(response.status, body, fallback);
}
