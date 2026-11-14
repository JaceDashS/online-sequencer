import { getTransport } from '../../transport';
import type { IHttpRequestOptions, ITransport } from '../../transport/types';
import { getFeedbackAppId, isLoginAvailable, requireApiUrl } from '../../utils/apiConfig';
import { getJaceSession, refreshJaceSession, withJaceAuth } from '../auth/jaceSession';

export interface FeedbackSubmissionInput {
  content: string;
  userPassword?: string;
  sourceAppId?: number;
}

export interface FeedbackSubmissionResult {
  id: number;
}

export class FeedbackRateLimitError extends Error {
  constructor() {
    super('Too many attempts. Please try again later.');
    this.name = 'FeedbackRateLimitError';
  }
}

function isSignedInWithCsrf(): boolean {
  const session = getJaceSession();
  return isLoginAvailable() && session.status === 'signed-in' && Boolean(session.csrfToken);
}

function buildCommentRequest(input: FeedbackSubmissionInput, useSession: boolean): IHttpRequestOptions {
  const content = input.content.trim();
  const sourceAppId = input.sourceAppId ?? getFeedbackAppId();
  const body: Record<string, unknown> = {
    parentHeaderId: null,
    content,
    sourceAppId,
  };
  if (!useSession && input.userPassword !== undefined) {
    body.userPassword = input.userPassword;
  }

  const baseOptions: IHttpRequestOptions = {
    url: `${requireApiUrl()}/comments`,
    method: 'POST',
    credentials: 'omit',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  };

  return useSession ? withJaceAuth(baseOptions) : baseOptions;
}

/**
 * Online Sequencer 피드백을 jace-s 댓글 API(POST /comments)로 전송합니다.
 *
 * - sourceAppId에 Online Sequencer 앱 ID(기본 4)를 포함해 DB에 출처를 기록합니다.
 * - 로그인 세션과 CSRF 토큰이 있으면 계정 댓글로 전송하며, 403 CSRF 오류 시 세션을 한 번 갱신해 재시도합니다.
 * - 비로그인 상태에서는 방문자 수정/삭제용 비밀번호(userPassword)와 함께 전송합니다.
 */
export async function submitSequencerFeedback(
  input: FeedbackSubmissionInput,
  transport: Pick<ITransport, 'request'> = getTransport()
): Promise<FeedbackSubmissionResult> {
  const content = input.content.trim();
  if (!content) {
    throw new Error('Please enter your feedback.');
  }

  const useSession = isSignedInWithCsrf();
  if (!useSession && (!input.userPassword || !input.userPassword.trim())) {
    throw new Error('Please enter a password.');
  }

  let response = await transport.request(buildCommentRequest(input, useSession));

  if (useSession && response.status === 403) {
    const payload = await response.json().catch(() => null) as { error?: unknown } | null;
    if (payload?.error === 'CSRF_VALIDATION_FAILED') {
      await refreshJaceSession();
      if (isSignedInWithCsrf()) {
        response = await transport.request(buildCommentRequest(input, true));
      } else if (input.userPassword && input.userPassword.trim()) {
        response = await transport.request(buildCommentRequest(input, false));
      }
    }
  }

  if (response.status === 429) {
    throw new FeedbackRateLimitError();
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => null) as { error?: unknown } | null;
    const message =
      typeof errorData?.error === 'string' && errorData.error
        ? errorData.error
        : `Failed to submit feedback: ${response.status}`;
    throw new Error(message);
  }

  const data = (await response.json()) as { id?: unknown };
  return { id: typeof data?.id === 'number' ? data.id : 0 };
}
