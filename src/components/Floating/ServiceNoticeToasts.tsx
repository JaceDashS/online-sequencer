import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getTransport } from '../../transport';
import { getApiUrl, getNoticeAppId } from '../../utils/apiConfig';
import {
  loadServiceStatus,
  resolveServiceNoticeToasts,
  type ServiceNoticeToast,
  type ServiceStatusSnapshot,
} from '../../core/notices/serviceNotices';
import { subscribeNoticePreview } from '../../utils/uiPreview';
import { getTopToastSlot } from '../../utils/topToastHost';
import styles from './ServiceNoticeToasts.module.css';

/**
 * 앱 진입 때 한 번만 조회합니다. (StrictMode 이중 effect, 재마운트에서도 요청을 반복하지 않음)
 */
let statusPromise: Promise<ServiceStatusSnapshot> | null = null;

function loadOnce(): Promise<ServiceStatusSnapshot> {
  if (!statusPromise) {
    statusPromise = loadServiceStatus(getTransport(), getApiUrl(), getNoticeAppId());
  }
  return statusPromise;
}

/**
 * jace-s 서비스 공지·장애 상단 토스트
 *
 * 화면 위 가운데에 쌓이며, 색은 Sequencer 테마 변수를 따릅니다.
 * 변형(transform)이 있는 부모의 영향을 받지 않도록 document.body에 포털로 그립니다.
 */
const ServiceNoticeToasts: React.FC = () => {
  const [toasts, setToasts] = useState<ServiceNoticeToast[]>([]);
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((key: string) => {
    const timer = timersRef.current.get(key);
    if (timer !== undefined) {
      clearTimeout(timer);
      timersRef.current.delete(key);
    }
    setToasts((current) => current.filter((toast) => toast.key !== key));
  }, []);

  const showToasts = useCallback((next: ServiceNoticeToast[], mode: 'replace' | 'append') => {
    setToasts((current) => (mode === 'replace' ? next : [...current, ...next]));
    for (const toast of next) {
      if (toast.autoDismissMs !== null) {
        timersRef.current.set(
          toast.key,
          setTimeout(() => dismiss(toast.key), toast.autoDismissMs)
        );
      }
    }
  }, [dismiss]);

  // 어드민 미리보기: 서버 결과와 같은 규칙으로 예시 토스트를 추가한다 (서버 요청 없음)
  useEffect(() => {
    let previewCount = 0;
    return subscribeNoticePreview((snapshot) => {
      previewCount += 1;
      const prefix = `preview-${previewCount}:`;
      showToasts(
        resolveServiceNoticeToasts(snapshot).map((toast) => ({ ...toast, key: prefix + toast.key })),
        'append'
      );
    });
  }, [showToasts]);

  useEffect(() => {
    let cancelled = false;
    const timers = timersRef.current;

    loadOnce()
      .then((snapshot) => {
        if (cancelled) return;
        showToasts(resolveServiceNoticeToasts(snapshot), 'append');
      })
      .catch(() => {
        // loadServiceStatus는 실패를 내부에서 처리하므로 여기까지 오지 않는다.
      });

    return () => {
      cancelled = true;
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, [showToasts]);

  if (toasts.length === 0 || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div className={styles.container}>
      {toasts.map((toast) => (
        <div
          key={toast.key}
          className={`${styles.toast} ${toast.kind === 'outage' ? styles.outage : ''}`}
          role={toast.role}
        >
          {/* 제목·문구는 텍스트로만 렌더링 (HTML 해석 금지) */}
          <span className={styles.text}>{toast.text}</span>
          <button
            type="button"
            className={styles.close}
            onClick={() => dismiss(toast.key)}
            aria-label="닫기"
          >
            ×
          </button>
        </div>
      ))}
    </div>,
    getTopToastSlot('notices')
  );
};

export default ServiceNoticeToasts;
