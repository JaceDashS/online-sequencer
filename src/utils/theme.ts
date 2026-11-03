/**
 * 테마 설정
 *
 * - 저장 위치: localStorage 'theme' ('light' | 'dark', 기본 dark)
 * - 적용: document.documentElement의 data-theme 속성
 * - 첫 렌더 전에 main.tsx에서 한 번 적용하고, 이후 변경은 ThemeToggle이 applyTheme으로 처리한다.
 */

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'theme';

export function getStoredTheme(): Theme {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function applyTheme(theme: Theme, options: { persist?: boolean } = {}): void {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme);
  }
  if (options.persist) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // 저장 실패: 현재 화면에만 적용
    }
  }
}
