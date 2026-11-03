import React, { useEffect, useState } from 'react';
import styles from './AdminPreviewPanel.module.css';
import { getJaceSession, subscribeJaceSession, type JaceSessionState } from '../../core/auth/jaceSession';
import { OUTAGE_MESSAGE } from '../../core/notices/serviceNotices';
import { createRoomApiError } from '../../core/sync/roomApiErrors';
import { showError } from '../../utils/toastStore';
import {
  previewServiceNotices,
  resetUiPreview,
  setAccountPreview,
  setHostingPreview,
  useUiPreview,
  type AccountPreview,
} from '../../utils/uiPreview';

const SAMPLE_NOTICES = [
  { id: 'preview-n1', title: '오늘 밤 11시부터 30분간 점검합니다' },
  { id: 'preview-n2', title: '<b>HTML은 텍스트로</b>' },
];

const ROOM_ERRORS: Array<{ code: string; status: number }> = [
  { code: 'ACTIVE_ROOM_LIMIT', status: 409 },
  { code: 'RATE_LIMITED', status: 429 },
  { code: 'CSRF_VALIDATION_FAILED', status: 403 },
  { code: 'NO_AVAILABLE_ROOM_CODES', status: 409 },
  { code: 'ROOM_NOT_FOUND', status: 404 },
  { code: 'KICKED', status: 403 },
  { code: 'UNAUTHORIZED', status: 401 },
];

const MINUTE = 60_000;

/**
 * 어드민 UI 미리보기 패널
 *
 * jace-s 세션의 isAdmin이 true일 때만 보인다(jace-s 메인 사이트와 같은 기준).
 * 새 UI를 서버 상태와 관계없이 강제로 띄운다. 서버 요청을 보내지 않고 실제 상태를 바꾸지 않으며,
 * 새로고침하면 사라진다. isAdmin은 화면 표시용이며 권한 판정이 아니다.
 */
const AdminPreviewPanel: React.FC = () => {
  const [session, setSession] = useState<JaceSessionState>(() => getJaceSession());
  const preview = useUiPreview();

  useEffect(() => subscribeJaceSession(setSession), []);

  if (session.status !== 'signed-in' || !session.isAdmin) {
    return null;
  }

  const hostRoom = (minutesLeft: number, sessionStatus: 'signed-in' | 'signed-out', guests: string[] = ['Guest A', 'Guest B']) => {
    setHostingPreview({ expiresAt: Date.now() + minutesLeft * MINUTE, sessionStatus, guests, allowing: false });
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span>ADMIN PREVIEW</span>
        <button type="button" className={styles.reset} onClick={resetUiPreview} title="Clear every preview">
          Reset
        </button>
      </div>
      <p className={styles.note}>Display only. No server requests; cleared on reload.</p>

      <section className={styles.group}>
        <div className={styles.label}>Notice toasts</div>
        <div className={styles.buttons}>
          <button type="button" onClick={() => previewServiceNotices({ connected: true, announcements: SAMPLE_NOTICES.slice(0, 1) })}>
            Online notice (8s)
          </button>
          <button type="button" onClick={() => previewServiceNotices({ connected: false, announcements: SAMPLE_NOTICES })}>
            Offline notices
          </button>
          <button type="button" onClick={() => previewServiceNotices({ connected: false, announcements: [] })} title={OUTAGE_MESSAGE}>
            Outage
          </button>
        </div>
      </section>

      <section className={styles.group}>
        <div className={styles.label}>Account button</div>
        <div className={styles.buttons}>
          {([
            ['off', null],
            ['Log in', 'signed-out'],
            ['Checking', 'checking'],
            ['Signed in', 'signed-in'],
          ] as Array<[string, AccountPreview | null]>).map(([label, value]) => (
            <button
              key={label}
              type="button"
              className={preview.account === value ? styles.active : ''}
              onClick={() => setAccountPreview(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className={styles.group}>
        <div className={styles.label}>Hosting dropdown (room 0000)</div>
        <div className={styles.buttons}>
          <button type="button" onClick={() => hostRoom(60, 'signed-out')}>Guest 1h + hint</button>
          <button type="button" onClick={() => hostRoom(360, 'signed-in')}>Signed-in 6h</button>
          <button type="button" onClick={() => hostRoom(2, 'signed-out', ['Guest A'])}>Expiring 2m</button>
          <button type="button" onClick={() => hostRoom(-1, 'signed-in', [])}>Expired</button>
          <button type="button" className={preview.hosting ? '' : styles.active} onClick={() => setHostingPreview(null)}>off</button>
        </div>
        <div className={styles.hint}>Shown only while not actually hosting or joining.</div>
      </section>

      <section className={styles.group}>
        <div className={styles.label}>Room API error toasts</div>
        <div className={styles.buttons}>
          {ROOM_ERRORS.map(({ code, status }) => (
            <button
              key={code}
              type="button"
              onClick={() => showError(createRoomApiError(status, { error: code }, 'Request failed').message)}
            >
              {code}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
};

export default AdminPreviewPanel;
