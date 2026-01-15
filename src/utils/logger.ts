/**
 * 로깅 유틸리티
 * 개발 환경에서만 로그를 출력하고, 프로덕션에서는 제거됩니다.
 * 
 * @remarks
 * - log, warn, debug: 개발 환경에서만 출력
 * - error: 모든 환경에서 출력 (에러는 항상 중요)
 */

const isDevelopment = !!import.meta.env?.DEV;

/**
 * 로거 객체
 * 
 * @property {Function} log - 일반 로그 (개발 환경에서만)
 * @property {Function} warn - 경고 로그 (개발 환경에서만)
 * @property {Function} error - 에러 로그 (모든 환경)
 * @property {Function} debug - 디버그 로그 (개발 환경에서만)
 */
export const logger = {
  /**
   * 일반 로그를 출력합니다 (개발 환경에서만)
   * 
   * @param args - 로그할 인자들
   */
  log: (...args: unknown[]) => {
    if (isDevelopment) {
      console.log(...args);
    }
  },
  
  /**
   * 경고 로그를 출력합니다 (개발 환경에서만)
   * 
   * @param args - 로그할 인자들
   */
  warn: (...args: unknown[]) => {
    if (isDevelopment) {
      console.warn(...args);
    }
  },
  
  /**
   * 에러 로그를 출력합니다 (모든 환경)
   * 
   * @param args - 로그할 인자들
   * 
   * @remarks
   * 에러는 항상 로그 출력합니다
   */
  error: (...args: unknown[]) => {
    console.error(...args);
  },
  
  /**
   * 디버그 로그를 출력합니다 (개발 환경에서만)
   * 
   * @param args - 로그할 인자들
   */
  debug: (...args: unknown[]) => {
    if (isDevelopment) {
      console.debug(...args);
    }
  },
};
