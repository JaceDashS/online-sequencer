/**
 * 어드민 UI 미리보기
 *
 * 어드민(jace-s 세션 isAdmin)이 서버 상태와 관계없이 새 UI를 강제로 띄워 확인하기 위한 화면 전용 상태.
 * - 서버 요청을 보내지 않는다. 실제 방·세션·공지 상태를 바꾸지 않는다.
 * - 새로고침하면 모두 사라진다(저장하지 않음).
 */

import { useSyncExternalStore } from 'react';
import type { ServiceStatusSnapshot } from '../core/notices/serviceNotices';

export type AccountPreview = 'checking' | 'signed-out' | 'signed-in';

export interface HostingPreview {
  /** 방 만료 시각 (epoch ms) */
  expiresAt: number;
  /** 로그인 안내 문구 표시 여부를 결정하는 가상 로그인 상태 */
  sessionStatus: 'signed-in' | 'signed-out';
  /** 가상 참가자 (호스트 자신 제외) */
  guests: string[];
  /** Allow 버튼을 누른 상태 */
  allowing: boolean;
}

export interface UiPreviewState {
  account: AccountPreview | null;
  hosting: HostingPreview | null;
}

type Listener = () => void;
type NoticeListener = (snapshot: ServiceStatusSnapshot) => void;

const initialState: UiPreviewState = { account: null, hosting: null };
let state: UiPreviewState = initialState;
const listeners = new Set<Listener>();
const noticeListeners = new Set<NoticeListener>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

export function getUiPreview(): UiPreviewState {
  return state;
}

export function subscribeUiPreview(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useUiPreview(): UiPreviewState {
  return useSyncExternalStore(subscribeUiPreview, getUiPreview, getUiPreview);
}

export function setAccountPreview(account: AccountPreview | null): void {
  state = { ...state, account };
  emit();
}

export function setHostingPreview(hosting: HostingPreview | null): void {
  state = { ...state, hosting };
  emit();
}

export function updateHostingPreview(patch: Partial<HostingPreview>): void {
  if (!state.hosting) return;
  state = { ...state, hosting: { ...state.hosting, ...patch } };
  emit();
}

export function resetUiPreview(): void {
  state = initialState;
  emit();
}

/**
 * 공지 토스트 미리보기를 띄웁니다. 실제 /health·/notices 결과와 같은 규칙으로 표시됩니다.
 */
export function previewServiceNotices(snapshot: ServiceStatusSnapshot): void {
  noticeListeners.forEach((listener) => listener(snapshot));
}

export function subscribeNoticePreview(listener: NoticeListener): () => void {
  noticeListeners.add(listener);
  return () => {
    noticeListeners.delete(listener);
  };
}
