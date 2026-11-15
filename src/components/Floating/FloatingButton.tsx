import React, { useState } from 'react';
import styles from './FloatingButton.module.css';
import FeedbackModal from './FeedbackModal';
import { getSiteUrl } from '../../utils/apiConfig';

const FloatingButton: React.FC = () => {
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const aboutDeveloperUrl = `${getSiteUrl() ?? 'https://jace-s.com'}/about`;

  return (
    <>
      <a
        href={aboutDeveloperUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.floatingButton}
        title="About Developer"
        style={{ textDecoration: 'none' }}
      >
        About Developer
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
