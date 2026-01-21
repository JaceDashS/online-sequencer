import React, { useState, useRef, useEffect } from 'react';
import styles from './PasswordModal.module.css';

interface PasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const PasswordModal: React.FC<PasswordModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsVerifying(true);

    try {
      const serverUrl = import.meta.env.VITE_COLLABORATION_SERVER_URL || 'http://10.0.0.79:3000';
      const requestBody = { password: password.trim() };
      
      const response = await fetch(`${serverUrl}/api/auth/verify-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error('비밀번호 검증 실패');
      }

      const result = await response.json();
      
      // 응답 형식: { valid: true } 또는 { valid: false }
      if (result.valid === true) {
        onSuccess();
        setPassword('');
        onClose();
      } else {
        setError('비밀번호가 올바르지 않습니다.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '비밀번호 검증 중 오류가 발생했습니다.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleCancel = () => {
    setPassword('');
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={handleCancel}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h3 className={styles.title}>Admin 비밀번호 입력</h3>
        </div>
        <form onSubmit={handleSubmit} className={styles.form}>
          <input
            ref={inputRef}
            type="password"
            className={styles.input}
            placeholder="비밀번호를 입력하세요"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isVerifying}
            autoComplete="off"
          />
          {error && <div className={styles.error}>{error}</div>}
          <div className={styles.buttons}>
            <button
              type="button"
              className={styles.cancelButton}
              onClick={handleCancel}
              disabled={isVerifying}
            >
              취소
            </button>
            <button
              type="submit"
              className={styles.submitButton}
              disabled={isVerifying || !password.trim()}
            >
              {isVerifying ? '검증 중...' : '확인'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PasswordModal;

