import React, { useState } from 'react';
import styles from './FloatingButton.module.css';
import FeedbackModal from './FeedbackModal';
import { getSiteUrl } from '../../utils/apiConfig';

const FloatingButton: React.FC = () => {
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const mainPageUrl = `${getSiteUrl() ?? 'https://jace-s.com'}/apps`;

  return (
    <>
      <a
        href={mainPageUrl}
        className={styles.floatingButton}
        title="Go to main page"
        style={{ textDecoration: 'none' }}
      >
        Main page
      </a>
      <button
        type="button"
        className={styles.floatingButton}
        onClick={() => setIsFeedbackOpen(true)}
        title="Send feedback"
      >
        Feedback
      </button>
      <FeedbackModal
        isOpen={isFeedbackOpen}
        onClose={() => setIsFeedbackOpen(false)}
      />
    </>
  );
};

export default FloatingButton;
