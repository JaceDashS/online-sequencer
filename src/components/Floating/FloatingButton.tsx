import React, { useState } from 'react';
import styles from './FloatingButton.module.css';
import FeedbackModal from './FeedbackModal';

const FloatingButton: React.FC = () => {
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);

  return (
    <>
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
