/**
 * 토스트 알림 스토어
 */

type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

type ToastCallback = (toasts: Toast[]) => void;

class ToastStore {
  private toasts: Toast[] = [];
  private listeners: Set<ToastCallback> = new Set();

  /**
   * 토스트 추가
   */
  addToast(message: string, type: ToastType = 'info', duration: number = 5000): string {
    const id = `toast-${Date.now()}-${Math.random()}`;
    const toast: Toast = {
      id,
      message,
      type,
      duration
    };

    this.toasts.push(toast);
    this.notify();

    // 자동 제거
    if (duration > 0) {
      setTimeout(() => {
        this.removeToast(id);
      }, duration);
    }

    return id;
  }

  /**
   * 토스트 제거
   */
  removeToast(id: string): void {
    this.toasts = this.toasts.filter(toast => toast.id !== id);
    this.notify();
  }

  /**
   * 모든 토스트 가져오기
   */
  getToasts(): Toast[] {
    return [...this.toasts];
  }

  /**
   * 구독
   */
  subscribe(callback: ToastCallback): () => void {
    this.listeners.add(callback);
    callback(this.toasts);

    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * 변경 알림
   */
  private notify(): void {
    this.listeners.forEach(callback => {
      try {
        callback(this.toasts);
      } catch (error) {
        console.error('[toastStore] Error in callback:', error);
      }
    });
  }
}

export const toastStore = new ToastStore();

/**
 * 헬퍼 함수들
 */
export const showToast = (message: string, type: ToastType = 'info', duration?: number) => {
  return toastStore.addToast(message, type, duration);
};

export const showError = (message: string, duration?: number) => {
  return toastStore.addToast(message, 'error', duration);
};

export const showSuccess = (message: string, duration?: number) => {
  return toastStore.addToast(message, 'success', duration);
};

export const showWarning = (message: string, duration?: number) => {
  return toastStore.addToast(message, 'warning', duration);
};

export const showInfo = (message: string, duration?: number) => {
  return toastStore.addToast(message, 'info', duration);
};

