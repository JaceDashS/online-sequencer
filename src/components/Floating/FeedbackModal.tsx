import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './FeedbackModal.module.css';
import {
  getJaceSession,
  getSessionDisplayName,
  openJaceLoginWindow,
  refreshJaceSession,
  subscribeJaceSession,
  type JaceSessionState,
} from '../../core/auth/jaceSession';
import { FeedbackRateLimitError, submitSequencerFeedback } from '../../core/feedback/feedbackClient';
import { getApiUrl, getSiteUrl, isLoginAvailable } from '../../utils/apiConfig';

export interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const FeedbackModal: React.FC<FeedbackModalProps> = ({ isOpen, onClose }) => {
  const [session, setSession] = useState<JaceSessionState>(() => getJaceSession());
  const [content, setContent] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const unsubscribe = subscribeJaceSession(setSession);
    if (isLoginAvailable()) {
      void refreshJaceSession();
    }
    return unsubscribe;
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setContent('');
      setPassword('');
      setIsSubmitting(false);
      setStatus('idle');
      setErrorMessage(null);
    }
  }, [isOpen]);

  if (!isOpen || typeof document === 'undefined') {
    return null;
  }

  const loginSupported = isLoginAvailable();
  const signedInWithCsrf = loginSupported && session.status === 'signed-in' && Boolean(session.csrfToken);
  const displayName = getSessionDisplayName(session.user) || 'Signed in';
  const siteUrl = getSiteUrl();
  const apiConfigured = getApiUrl() !== null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!apiConfigured) {
      setStatus('error');
      setErrorMessage('Feedback server is not configured.');
      return;
    }

    if (!content.trim()) {
      setStatus('error');
      setErrorMessage('Please enter your feedback.');
      return;
    }

    if (!signedInWithCsrf && !password.trim()) {
      setStatus('error');
      setErrorMessage('Please enter a password.');
      return;
    }

    setIsSubmitting(true);
    setStatus('idle');
    setErrorMessage(null);

    try {
      await submitSequencerFeedback({
        content: content.trim(),
        ...(signedInWithCsrf ? {} : { userPassword: password }),
      });
      setStatus('success');
      setContent('');
      setPassword('');
    } catch (err: unknown) {
      setStatus('error');
      if (err instanceof FeedbackRateLimitError) {
        setErrorMessage('Too many attempts. Please try again later.');
      } else {
        setErrorMessage(err instanceof Error ? err.message : 'Failed to submit feedback. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="sequencer-feedback-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape' && !isSubmitting) onClose();
      }}
    >
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 id="sequencer-feedback-title" className={styles.title}>Feedback</h2>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close feedback"
          >
            ×
          </button>
        </div>

        <p className={styles.subtitle}>
          Feedback is posted publicly in the main site comments together with Online Sequencer.
        </p>

        {siteUrl && (
          <a
            href={`${siteUrl}/comments`}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.viewAllLink}
          >
            View all feedback →
          </a>
        )}

        {status === 'success' ? (
          <div className={styles.successMessage}>
            Thank you. Your feedback has been posted.
          </div>
        ) : (
          <form className={styles.form} onSubmit={handleSubmit}>
            {signedInWithCsrf ? (
              <div className={styles.sessionBox}>
                Posting as: <strong>{displayName}</strong>
              </div>
            ) : (
              <>
                {loginSupported && (
                  <button
                    type="button"
                    className={styles.signInButton}
                    onClick={openJaceLoginWindow}
                  >
                    Sign in (password or Google)
                  </button>
                )}
                <div className={styles.field}>
                  <label htmlFor="sequencer-feedback-password" className={styles.label}>
                    Password <span className={styles.required}>*</span>
                  </label>
                  <input
                    id="sequencer-feedback-password"
                    type="password"
                    className={styles.input}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (status === 'error') {
                        setStatus('idle');
                        setErrorMessage(null);
                      }
                    }}
                    placeholder="Password for editing or deleting your feedback"
                    autoComplete="new-password"
                    required
                    disabled={isSubmitting}
                  />
                  <span className={styles.helpText}>
                    You will need this password to edit or delete your feedback later.
                  </span>
                </div>
              </>
            )}

            <div className={styles.field}>
              <label htmlFor="sequencer-feedback-content" className={styles.label}>
                Feedback <span className={styles.required}>*</span>
              </label>
              <textarea
                id="sequencer-feedback-content"
                className={styles.textarea}
                rows={5}
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  if (status === 'error') {
                    setStatus('idle');
                    setErrorMessage(null);
                  }
                }}
                placeholder="Share your thoughts, suggestions, or report issues..."
                required
                disabled={isSubmitting}
              />
            </div>

            {status === 'error' && errorMessage && (
              <div className={styles.errorMessage}>{errorMessage}</div>
            )}

            <button
              type="submit"
              className={styles.submitButton}
              disabled={isSubmitting || !content.trim() || (!signedInWithCsrf && !password.trim())}
            >
              {isSubmitting ? 'Sending...' : 'Send feedback'}
            </button>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
};

export default FeedbackModal;
