import type { AdminMenu } from '../core/auth/jaceSession';

/**
 * 미리보기 영역별 필요 권한 (jace-s 관리 메뉴 기준, 화면 표시용)
 * 바꾸려면 이 표만 고친다.
 */
export const PREVIEW_PERMISSIONS: Record<'notices' | 'account' | 'rooms', { menu: AdminMenu; level: 'read' | 'write' }> = {
  notices: { menu: 'notices', level: 'read' },
  account: { menu: 'users', level: 'read' },
  rooms: { menu: 'rooms', level: 'read' },
};
