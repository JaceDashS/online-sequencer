import React, { useState, useRef, useEffect } from 'react';
import styles from './CollaborationButtons.module.css';
import { CollaborationManager } from '../../core/sync/CollaborationManager';
import { setCollaborationManager } from '../../core/sync/collaborationSession';
import { getOrCreateClientId } from '../../core/sync/utils/uuid';
import type { ConnectionState } from '../../core/sync/types/p2p';

interface Participant {
  id: string;
  name: string;
  connectionState?: ConnectionState;
}

interface CollaborationButtonsProps {
  onStartHost?: () => void;
  onJoinSession?: () => void;
}

type CollaborationMode = 'idle' | 'hosting' | 'joining' | 'loading';

const CollaborationButtons: React.FC<CollaborationButtonsProps> = ({ 
  onStartHost, 
  onJoinSession 
}) => {
  const [mode, setMode] = useState<CollaborationMode>('idle');
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [showParticipantsDropdown, setShowParticipantsDropdown] = useState(false);
  const [joinRoomCode, setJoinRoomCode] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [allowCountdown, setAllowCountdown] = useState<number | null>(null);
  const [hostCooldown, setHostCooldown] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const joinInputRef = useRef<HTMLInputElement>(null);
  const collaborationManagerRef = useRef<CollaborationManager | null>(null);
  const clientId = getOrCreateClientId();

  // CollaborationManager 초기화
  useEffect(() => {
    if (!collaborationManagerRef.current) {
      collaborationManagerRef.current = new CollaborationManager();
      setCollaborationManager(collaborationManagerRef.current);
    }

    // room-closed 메시지 핸들러 등록
    const handleRoomClosed = () => {
      setMode('idle');
      setRoomCode(null);
      setParticipants([]);
      setShowParticipantsDropdown(false);
      setIsHost(false);
      setAllowCountdown(null);
      setError('The host has ended the session');
    };

    // participant-joined 메시지 핸들러 등록
    const handleParticipantJoined = (message: any) => {
      if (message.data?.participantId) {
        const participantId = message.data.participantId;
        setParticipants(prev => {
          const exists = prev.some(p => p.id === participantId);
          if (exists) {
            return prev.map(p => {
              if (p.id !== participantId || p.connectionState) {
                return p;
              }
              return { ...p, connectionState: 'connected' };
            });
          }
          return [
            ...prev,
            {
              id: participantId,
              name: `Participant ${participantId.slice(0, 8)}`,
              connectionState: 'connected'
            }
          ];
        });
      }
    };

    // participant-left 메시지 핸들러 등록
    const handleParticipantLeft = (message: any) => {
      if (message.data?.participantId) {
        const participantId = message.data.participantId;
        setParticipants(prev => prev.filter(p => p.id !== participantId));
      }
    };

    // kicked 메시지 핸들러 등록 (게스트가 강퇴당했을 때)
    const handleKicked = () => {
      
      // WebRTC 연결 종료
      if (collaborationManagerRef.current) {
        collaborationManagerRef.current.disconnect();
      }
      
      setMode('idle');
      setRoomCode(null);
      setParticipants([]);
      setShowParticipantsDropdown(false);
      setIsHost(false);
      setError('You have been kicked from the session');
    };

    // 연결 상태 변화 핸들러 등록
    const handleConnectionStateChange = (peerId: string, state: ConnectionState) => {
      
      // 연결 끊김 상태인 경우 참가자 목록에서 제거 (자신이 아닌 경우)
      if ((state === 'disconnected' || state === 'failed' || state === 'closed') && peerId !== clientId) {
        setParticipants(prev => prev.filter(p => p.id !== peerId));
        
        // 호스트 연결 끊김 시 게스트는 세션 종료
        if (!isHost && peerId === collaborationManagerRef.current?.getHostId()) {
          setMode('idle');
          setRoomCode(null);
          setParticipants([]);
          setShowParticipantsDropdown(false);
          setIsHost(false);
          setError('Host disconnected');
        }
      } else {
        // 연결 상태 업데이트
        setParticipants(prev => prev.map(p => 
          p.id === peerId ? { ...p, connectionState: state } : p
        ));
      }
    };

    if (collaborationManagerRef.current) {
      collaborationManagerRef.current.onServerMessage('room-closed', handleRoomClosed);
      collaborationManagerRef.current.onServerMessage('participant-joined', handleParticipantJoined);
      collaborationManagerRef.current.onServerMessage('participant-left', handleParticipantLeft);
      collaborationManagerRef.current.onServerMessage('kicked', handleKicked);
      collaborationManagerRef.current.onConnectionStateChange(handleConnectionStateChange);
    }

    return () => {
      // 메시지 핸들러 제거
      if (collaborationManagerRef.current) {
        collaborationManagerRef.current.offServerMessage('room-closed', handleRoomClosed);
        collaborationManagerRef.current.offServerMessage('participant-joined', handleParticipantJoined);
        collaborationManagerRef.current.offServerMessage('participant-left', handleParticipantLeft);
        collaborationManagerRef.current.offServerMessage('kicked', handleKicked);
        collaborationManagerRef.current.offConnectionStateChange(handleConnectionStateChange);
      }
      // 컴포넌트 언마운트 시 연결 종료
      if (collaborationManagerRef.current) {
        collaborationManagerRef.current.disconnect();
        collaborationManagerRef.current = null;
        setCollaborationManager(null);
      }
    };
  }, []);

  // 에러 메시지 자동 제거
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const handleStartHost = async () => {
    if (!collaborationManagerRef.current) {
      setError('Collaboration manager not initialized');
      return;
    }

    try {
      setMode('loading');
      setError(null);

      // WebSocket 연결
      if (!collaborationManagerRef.current.connected) {
        await collaborationManagerRef.current.connect();
      }

      // 룸 생성 및 호스팅 시작
      const newRoomCode = await collaborationManagerRef.current.startHosting();
      
      setRoomCode(newRoomCode);
      setMode('hosting');
      setIsHost(true);
      
      setParticipants([{
        id: clientId,
        name: 'You',
        connectionState: 'connected'
      }]);

      if (onStartHost) {
        onStartHost();
      }
    } catch (err) {
      console.error('Failed to start host:', err);
      setError(err instanceof Error ? err.message : 'Failed to start hosting');
      setMode('idle');
    }
  };

  const handleJoin = () => {
    setMode('joining');
    // 입력 필드 포커스
    setTimeout(() => {
      joinInputRef.current?.focus();
    }, 0);
  };

  const handleJoinConfirm = async () => {
    if (joinRoomCode.trim().length !== 4) {
      return;
    }

    if (!collaborationManagerRef.current) {
      setError('Collaboration manager not initialized');
      return;
    }

    const roomCodeToJoin = joinRoomCode.trim();

    try {
      setMode('loading');
      setError(null);

      // WebSocket 연결
      if (!collaborationManagerRef.current.connected) {
        await collaborationManagerRef.current.connect();
      }

      // 룸 조인
      await collaborationManagerRef.current.joinRoom(roomCodeToJoin);
      
      // 호스트 ID 가져오기
      const hostId = collaborationManagerRef.current.getHostId();
      
      setRoomCode(roomCodeToJoin);
      setMode('hosting');
      setIsHost(false);
      
      // 호스트 연결 상태 조회
      const hostConnectionState = collaborationManagerRef.current.getHostConnectionState();
      
      // 참가자 목록 (호스트 포함)
      setParticipants([
        {
          id: hostId || 'unknown',
          name: hostId === clientId ? 'You' : 'Host',
          connectionState: hostConnectionState || 'connecting'
        },
        {
          id: clientId,
          name: 'You',
          connectionState: 'connected' // 자신은 항상 연결됨
        }
      ]);
      setJoinRoomCode('');

      if (onJoinSession) {
        onJoinSession();
      }
    } catch (err) {
      console.error('Failed to join room:', err);
      setError(err instanceof Error ? err.message : 'Failed to join room');
      setMode('joining');
    }
  };

  const handleCancel = () => {
    setMode('idle');
    setRoomCode(null);
    setParticipants([]);
    setJoinRoomCode('');
    setShowParticipantsDropdown(false);
    setIsHost(false);
    setError(null);
  };

  const handleStopHost = async () => {
    if (collaborationManagerRef.current) {
      try {
        // CollaborationManager가 호스트/게스트 구분하여 처리
        collaborationManagerRef.current.disconnect();
      } catch (err) {
        console.error('Error stopping host:', err);
        setError(err instanceof Error ? err.message : 'Failed to stop hosting');
      }
    }

    setMode('idle');
    setRoomCode(null);
    setParticipants([]);
    setShowParticipantsDropdown(false);
    setIsHost(false);
    setAllowCountdown(null);
    setHostCooldown(5);
    setError(null);
  };

  const handleLeave = async () => {
    if (collaborationManagerRef.current) {
      try {
        collaborationManagerRef.current.disconnect();
      } catch (err) {
        console.error('Error leaving room:', err);
      }
    }

    setMode('idle');
    setRoomCode(null);
    setParticipants([]);
    setShowParticipantsDropdown(false);
    setIsHost(false);
    setError(null);
  };

  const handleAllowParticipant = async () => {
    if (!collaborationManagerRef.current || !roomCode) {
      setError('Not connected to a room');
      return;
    }

    if (!collaborationManagerRef.current.connected) {
      setError('Unknown error occurred. Please try again later.');
      return;
    }

    try {
      setError(null);
      await collaborationManagerRef.current.allowJoin(60);
      
      // Allow join for 60 seconds
      setAllowCountdown(60);
    } catch (err) {
      console.error('Failed to allow join:', err);
      setAllowCountdown(null);
      setError(collaborationManagerRef.current?.connected ? (err instanceof Error ? err.message : 'Failed to allow join') : 'Unknown error occurred. Please try again later.');
    }
  };

  const handleKickParticipant = async (participantId: string) => {
    if (!collaborationManagerRef.current || !isHost) {
      setError('Only host can kick participants');
      return;
    }

    try {
      setError(null);
      await collaborationManagerRef.current.kickParticipant(participantId);
      
      // 참가자 목록에서 제거 (서버에서 participant-left 메시지가 올 때까지 기다리지 않고 즉시 제거)
      setParticipants(prev => prev.filter(p => p.id !== participantId));
      
    } catch (err) {
      console.error('Failed to kick participant:', err);
      setError(err instanceof Error ? err.message : 'Failed to kick participant');
    }
  };

  // 카운트다운 타이머
  useEffect(() => {
    if (allowCountdown === null || allowCountdown <= 0) {
      return;
    }

    const timer = setInterval(() => {
      setAllowCountdown((prev) => {
        if (prev === null || prev <= 1) {
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [allowCountdown]);

  useEffect(() => {
    if (allowCountdown === null || allowCountdown <= 0) {
      return;
    }

    const timer = setInterval(() => {
      const manager = collaborationManagerRef.current;
      if (manager && !manager.connected) {
        setAllowCountdown(null);
        setError('Unknown error occurred. Please try again later.');
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [allowCountdown]);

  // 호스트 쿨다운 타이머
  useEffect(() => {
    if (hostCooldown === null || hostCooldown <= 0) {
      return;
    }

    const timer = setInterval(() => {
      setHostCooldown((prev) => {
        if (prev === null || prev <= 1) {
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [hostCooldown]);

  // 외부 클릭 감지
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && event.target instanceof Node && !dropdownRef.current.contains(event.target)) {
        setShowParticipantsDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const [showCollaborationDropdown, setShowCollaborationDropdown] = useState(false);
  const collaborationButtonRef = useRef<HTMLDivElement>(null);

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (collaborationButtonRef.current && event.target instanceof Node && !collaborationButtonRef.current.contains(event.target)) {
        setShowCollaborationDropdown(false);
      }
    };

    if (showCollaborationDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showCollaborationDropdown]);

  return (
    <div className={styles.collaborationButtons}>
      {/* 에러 메시지 표시 */}
      {error && (
        <div className={styles.errorMessage} title={error}>
          {error}
        </div>
      )}

      {/* Loading 상태 */}
      {mode === 'loading' && (
        <div className={styles.loadingIndicator}>
          <span>Loading...</span>
        </div>
      )}

      {/* Idle 상태: Collaboration 드롭다운 버튼 */}
      {mode === 'idle' && (
        <div 
          ref={collaborationButtonRef}
          className={styles.collaborationButtonContainer}
          onMouseEnter={() => setShowCollaborationDropdown(true)}
          onMouseLeave={() => setShowCollaborationDropdown(false)}
        >
          <button
            className={styles.collaborationButton}
            title="Collaboration"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            </svg>
            <span>Collaboration</span>
            <svg 
              width="12" 
              height="12" 
              viewBox="0 0 24 24" 
              fill="none" 
              xmlns="http://www.w3.org/2000/svg"
              className={styles.dropdownArrow}
            >
              <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            </svg>
          </button>
          {showCollaborationDropdown && (
            <div 
              className={styles.collaborationDropdown}
              onMouseEnter={() => setShowCollaborationDropdown(true)}
              onMouseLeave={() => setShowCollaborationDropdown(false)}
            >
              <button
                className={styles.dropdownItem}
                onClick={handleStartHost}
                disabled={hostCooldown !== null && hostCooldown > 0}
                title={hostCooldown !== null && hostCooldown > 0 ? `Please wait ${hostCooldown}s` : "Start hosting a new session"}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                  <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                  <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                </svg>
                <span>Host</span>
              </button>
              <button
                className={styles.dropdownItem}
                onClick={handleJoin}
                title="Join an existing session"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M16 21V19C16 17.9391 15.5786 16.9217 14.8284 16.1716C14.0783 15.4214 13.0609 15 12 15H5C3.93913 15 2.92172 15.4214 2.17157 16.1716C1.42143 16.9217 1 17.9391 1 19V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                  <circle cx="8.5" cy="7" r="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                  <line x1="17" y1="11" x2="23" y2="11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <line x1="20" y1="8" x2="20" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span>Join</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Joining 상태: 방번호 입력 필드와 버튼들 */}
      {mode === 'joining' && (
        <div className={styles.joinInputContainer}>
          <input
            ref={joinInputRef}
            type="text"
            className={styles.joinInput}
            value={joinRoomCode}
            onChange={(e) => {
              const value = e.target.value.replace(/\D/g, '').slice(0, 4);
              setJoinRoomCode(value);
            }}
            placeholder="0000"
            maxLength={4}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && joinRoomCode.trim().length === 4) {
                handleJoinConfirm();
              } else if (e.key === 'Escape') {
                handleCancel();
              }
            }}
          />
          <button
            className={styles.joinConfirmButton}
            onClick={handleJoinConfirm}
            disabled={joinRoomCode.trim().length !== 4}
            title="Join"
          >
            Join
          </button>
          <button
            className={styles.cancelButton}
            onClick={handleCancel}
            title="Cancel"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Hosting 상태: 드롭다운 */}
      {mode === 'hosting' && roomCode && (
        <div ref={dropdownRef} className={styles.hostDropdownContainer}>
          <button
            className={styles.dropdownTrigger}
            onClick={() => setShowParticipantsDropdown(!showParticipantsDropdown)}
            title="Room participants"
          >
            <span className={styles.roomCodeDisplay}>{roomCode}</span>
            <svg 
              width="12" 
              height="12" 
              viewBox="0 0 24 24" 
              fill="none" 
              xmlns="http://www.w3.org/2000/svg"
              className={styles.dropdownArrow}
              style={{ transform: showParticipantsDropdown ? 'rotate(180deg)' : 'rotate(0deg)' }}
            >
              <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            </svg>
          </button>
          
          {showParticipantsDropdown && (
            <div className={styles.participantsDropdown}>
              <div className={styles.participantsList}>
                <div className={styles.participantsTitle}>
                  Participants ({participants.length}/4)
                </div>
                {participants.map((participant) => {
                  const getConnectionStateIcon = (state?: ConnectionState) => {
                    switch (state) {
                      case 'connected':
                        return (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={styles.connectionIcon} style={{ color: '#4ade80' }}>
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="currentColor" />
                          </svg>
                        );
                      case 'connecting':
                        return (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={styles.connectionIcon} style={{ color: '#fbbf24' }}>
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none" strokeDasharray="4 4" />
                          </svg>
                        );
                      case 'disconnected':
                      case 'failed':
                      case 'closed':
                        return (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={styles.connectionIcon} style={{ color: '#ef4444' }}>
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none" />
                            <line x1="8" y1="8" x2="16" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                            <line x1="16" y1="8" x2="8" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                          </svg>
                        );
                      default:
                        return (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={styles.connectionIcon} style={{ color: '#9ca3af' }}>
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none" />
                          </svg>
                        );
                    }
                  };

                  const getConnectionStateText = (state?: ConnectionState) => {
                    switch (state) {
                      case 'connected':
                        return 'Connected';
                      case 'connecting':
                        return 'Connecting...';
                      case 'disconnected':
                        return 'Disconnected';
                      case 'failed':
                        return 'Failed';
                      case 'closed':
                        return 'Closed';
                      default:
                        return 'Unknown';
                    }
                  };

                  const isSelf = participant.id === clientId;
                  const canKick = isHost && !isSelf;

                  return (
                    <div key={participant.id} className={styles.participantItem} title={getConnectionStateText(participant.connectionState)}>
                      {getConnectionStateIcon(participant.connectionState)}
                      <span className={styles.participantName}>{participant.name}</span>
                      {canKick && (
                        <button
                          className={styles.kickButton}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleKickParticipant(participant.id);
                          }}
                          title={`Kick ${participant.name}`}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                      )}
                    </div>
                  );
                })}
                {isHost && (
                  <div className={styles.dropdownFooter}>
                    <div className={styles.footerButtons}>
                      {allowCountdown !== null && allowCountdown > 0 ? (
                        <div className={styles.countdownDisplay}>
                          Allow: {allowCountdown}s
                        </div>
                      ) : (
                        <button
                          className={styles.allowButton}
                          onClick={handleAllowParticipant}
                          title="Allow participants to join for 1 minute"
                        >
                          Allow 1min
                        </button>
                      )}
                      <button
                        className={styles.stopHostButton}
                        onClick={handleStopHost}
                        title="Stop hosting"
                      >
                        Stop Hosting
                      </button>
                    </div>
                  </div>
                )}
                {!isHost && (
                  <div className={styles.dropdownFooter}>
                    <button
                      className={styles.stopHostButton}
                      onClick={handleLeave}
                      title="Leave session"
                    >
                      Leave
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CollaborationButtons;
