import { useState, useEffect } from 'react';

/**
 * 화면 폭을 감지하는 커스텀 훅
 * 
 * @returns 현재 화면 폭 (px)
 * 
 * @example
 * ```tsx
 * const windowWidth = useWindowWidth();
 * const isNarrow = windowWidth <= BREAKPOINTS.ICON_ONLY;
 * ```
 */
export function useWindowWidth(): number {
  const [windowWidth, setWindowWidth] = useState<number>(window.innerWidth);
  
  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  return windowWidth;
}

