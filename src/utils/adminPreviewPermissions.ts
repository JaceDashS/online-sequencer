import type { AdminMenu } from '../core/auth/jaceSession';

export interface AdminPermission {
  menu: AdminMenu;
  level: 'read' | 'write';
}

/**
 * 개발자 패널 표시·동작에 필요한 권한 (jace-s 관리 메뉴 기준)
 * 진단·모니터링 성격이라 monitor read에 묶는다. 바꾸려면 이 값만 고친다.
 */
export const DEVELOPER_PANEL_PERMISSION: AdminPermission = { menu: 'monitor', level: 'read' };

/**
 * 미리보기 영역별 필요 권한 (jace-s 관리 메뉴 기준)
 * 바꾸려면 이 표만 고친다.
 */
export const PREVIEW_PERMISSIONS: Record<'notices' | 'account' | 'rooms', AdminPermission> = {
  notices: { menu: 'notices', level: 'read' },
  account: { menu: 'users', level: 'read' },
  rooms: { menu: 'rooms', level: 'read' },
};
