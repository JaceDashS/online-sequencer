import React, { useEffect, useState } from 'react';
import styles from './AccountButton.module.css';
import {
  getJaceSession,
  getSessionDisplayName,
  openJaceLoginWindow,
  refreshJaceSession,
  subscribeJaceSession,
  type JaceSessionState,
} from '../../core/auth/jaceSession';

/**
 * jace-s 로그인 상태 버튼
 *
 * 로그인은 허용 Origin(online-sequencer.jace-s.com)에서만 동작하므로,
 * 그 밖의 주소(vercel.app, localhost, Electron)에서는 렌더링하지 않는다.
 */
const AccountButton: React.FC = () => {
  const [session, setSession] = useState<JaceSessionState>(() => getJaceSession());

  useEffect(() => {
    const unsubscribe = subscribeJaceSession(setSession);
    void refreshJaceSession();
    return unsubscribe;
  }, []);

  if (session.status === 'unavailable') {
    return null;
  }

  if (session.status === 'signed-in') {
    const name = getSessionDisplayName(session.user);
    return (
      <span className={styles.account} title={name ? `Signed in as ${name}` : 'Signed in'}>
        {name || 'Signed in'}
      </span>
    );
  }

  return (
    <button
      type="button"
      className={styles.loginButton}
      onClick={openJaceLoginWindow}
      disabled={session.status === 'checking'}
      title="Log in with jace-s"
    >
      Log in
    </button>
  );
};

export default AccountButton;
