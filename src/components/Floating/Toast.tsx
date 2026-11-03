import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { getTopToastSlot } from '../../utils/topToastHost';
import { toastStore, type Toast } from '../../utils/toastStore';
import styles from './Toast.module.css';

export const ToastContainer: React.FC = () => {
  // 초기 상태를 toastStore에서 가져오기 (마운트 전에 추가된 토스트도 표시)
  const [toasts, setToasts] = useState<Toast[]>(() => {
    return toastStore.getToasts();
  });

  useEffect(() => {
    const unsubscribe = toastStore.subscribe((newToasts) => {
      // Force a new array reference to ensure React updates
      setToasts([...newToasts]);
    });

    return unsubscribe;
  }, []);

  const handleClose = (id: string) => {
    toastStore.removeToast(id);
  };

  if (toasts.length === 0 || typeof document === 'undefined') {
    return null;
  }

  // 서비스 공지 토스트와 같은 위치에 쌓아 겹치지 않게 한다 (공지 아래)
  return createPortal(
    <div className={styles.toastContainer}>
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`${styles.toast} ${styles[toast.type]}`}
          onClick={() => handleClose(toast.id)}
        >
          <div className={styles.toastContent}>
            <span className={styles.toastMessage}>{toast.message}</span>
            <button
              className={styles.toastClose}
              onClick={(e) => {
                e.stopPropagation();
                handleClose(toast.id);
              }}
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>,
    getTopToastSlot('app')
  );
};

