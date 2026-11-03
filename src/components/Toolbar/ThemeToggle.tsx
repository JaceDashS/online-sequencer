import React, { useState, useRef } from 'react';
import styles from './ThemeToggle.module.css';
import { useUIState } from '../../store/uiStore';
import { applyTheme, getStoredTheme } from '../../utils/theme';

const ThemeToggle: React.FC = () => {
  const ui = useUIState();
  // 첫 적용은 main.tsx에서 한다. 여기서는 저장된 값을 읽어 버튼 상태만 맞춘다.
  const [isDark, setIsDark] = useState(() => getStoredTheme() === 'dark');
  const devClickCountRef = useRef(0);

  const toggleTheme = () => {
    devClickCountRef.current += 1;
    if (devClickCountRef.current >= 10) {
      ui.toggleDevMode();
      devClickCountRef.current = 0;
    }
    const newTheme = isDark ? 'light' : 'dark';
    setIsDark(!isDark);
    applyTheme(newTheme, { persist: true });
  };

  return (
    <button
      className={styles.themeToggle}
      onClick={toggleTheme}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? (
        // Sun icon (light mode로 전환)
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="2" fill="none"/>
          <line x1="12" y1="1" x2="12" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          <line x1="12" y1="21" x2="12" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          <line x1="1" y1="12" x2="3" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          <line x1="21" y1="12" x2="23" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      ) : (
        // Moon icon (dark mode로 전환)
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke="currentColor" strokeWidth="2" fill="none"/>
        </svg>
      )}
    </button>
  );
};

export default ThemeToggle;
