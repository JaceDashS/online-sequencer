/**
 * UUID 생성 및 관리 유틸리티
 */

/**
 * UUID 생성 (crypto.randomUUID 사용, 폴백 포함)
 */
export function generateUUID(): string {
  // 브라우저 환경에서 crypto.randomUUID 사용
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // Node.js 환경에서 crypto 모듈 사용 (Electron 등)
  // require는 런타임에만 사용되므로 타입 체크를 우회
  if (typeof (globalThis as any).require !== 'undefined') {
    try {
      const crypto = (globalThis as any).require('crypto');
      return crypto.randomUUID();
    } catch (e) {
      // 폴백으로 계속 진행
    }
  }

  // 폴백: 간단한 UUID v4 구현
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * 클라이언트 ID를 로컬 스토리지에서 가져오거나 생성
 * @returns 클라이언트 UUID
 */
export function getOrCreateClientId(): string {
  const STORAGE_KEY = 'online-daw-client-id';
  
  // 브라우저 환경
  if (typeof localStorage !== 'undefined') {
    let clientId = localStorage.getItem(STORAGE_KEY);
    if (!clientId) {
      clientId = generateUUID();
      localStorage.setItem(STORAGE_KEY, clientId);
    }
    return clientId;
  }

  // Node.js 환경 (Electron 등)
  // Electron의 경우 localStorage가 사용 가능하지만, 안전을 위해 폴백 제공
  return generateUUID();
}

