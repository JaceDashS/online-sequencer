import React from 'react';
import styles from './MobileNotSupported.module.css';
import { BREAKPOINTS } from '../constants/ui';

const MobileNotSupported: React.FC = () => {
  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.icon}>
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="5" y="2" width="14" height="20" rx="2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            <line x1="12" y1="18" x2="12" y2="18.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <h1 className={styles.title}>Mobile Version Not Supported</h1>
        <p className={styles.message}>
          This application is designed for desktop use and requires a minimum screen width of {BREAKPOINTS.MOBILE_NOT_SUPPORTED}px.
          Please access this application from a desktop or laptop computer.
        </p>
      </div>
    </div>
  );
};

export default MobileNotSupported;

