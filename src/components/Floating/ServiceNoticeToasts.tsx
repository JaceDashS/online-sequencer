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
let statusPromise: Promise<ServiceStatusSnapshot | null> | null = null;

/**
 * VITE_API_URL이 없으면 서버 상태를 알 수 없으므로 조회하지 않고 토스트도 띄우지 않는다
 * (설정 누락은 콘솔에 알림). VITE_NOTICE_APP_ID가 없으면 공지 없이 생존 확인만 한다.
 */
function loadOnce(): Promise<ServiceStatusSnapshot | null> {
  if (!statusPromise) {
    const apiUrl = getApiUrl();
    statusPromise = apiUrl
      ? loadServiceStatus(getTransport(), apiUrl, getNoticeAppId())
      : Promise.resolve(null);
  }
  return statusPromise;
}

/**
 * jace-s 서비스 공지·장애 상단 토스트
 *
 * 화면 위 가운데에 토스트 하나로 보여 주며(공지가 여러 개면 한 줄씩), 색은 Sequencer 테마 변수를 따릅니다.
 * 미리보기와 서버 결과는 서로 겹쳐 쌓이지 않고 가장 최근 것으로 바뀝니다.
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

  const showToasts = useCallback((next: ServiceNoticeToast[]) => {
    // 이전 토스트의 자동 닫힘 타이머를 정리하고 새 결과로 바꾼다
    timersRef.current.forEach((timer) => clearTimeout(timer));
    timersRef.current.clear();
    setToasts(next);
    for (const toast of next) {
      if (toast.autoDismissMs !== null) {
        timersRef.current.set(
          toast.key,
          setTimeout(() => dismiss(toast.key), toast.autoDismissMs)
        );
      }
    }
  }, [dismiss]);

  // 어드민 미리보기: 서버 결과와 같은 규칙으로 예시 토스트를 보여 준다 (서버 요청 없음)
  useEffect(() => {
    let previewCount = 0;
    return subscribeNoticePreview((snapshot) => {
      previewCount += 1;
      const prefix = `preview-${previewCount}:`;
      showToasts(
        resolveServiceNoticeToasts(snapshot).map((toast) => ({ ...toast, key: prefix + toast.key }))
      );
    });
  }, [showToasts]);

  useEffect(() => {
    let cancelled = false;
    const timers = timersRef.current;

    loadOnce()
      .then((snapshot) => {
        if (cancelled || !snapshot) return;
        showToasts(resolveServiceNoticeToasts(snapshot));
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
          {toast.lines.length === 1 ? (
            <span className={styles.text}>{toast.lines[0]}</span>
          ) : (
            <ul className={`${styles.text} ${styles.lines}`}>
              {toast.lines.map((line, index) => <li key={index}>{line}</li>)}
            </ul>
          )}
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
