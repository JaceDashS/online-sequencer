import React, { useState, useEffect } from 'react';
import styles from './RoomsListModal.module.css';

interface Room {
  roomCode: string;
  hostId: string;
  allowJoin?: boolean;
  allowJoinExpiresAt?: number;
  expiresAt?: number;
  createdAt?: number;
  minutesLeft?: number;
  participantCount?: number;
  participants?: string[];
  maxParticipants?: number;
  connectedClients?: number;
  connectedClientIds?: string[];
  clientConnections?: unknown[];
  status?: string;
}

interface RoomsResponse {
  success: boolean;
  data: {
    totalRooms: number;
    rooms: Room[];
    timestamp: number;
  };
}

interface RoomsListModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const RoomsListModal: React.FC<RoomsListModalProps> = ({ isOpen, onClose }) => {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [rawResponse, setRawResponse] = useState<RoomsResponse[] | unknown>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [totalRooms, setTotalRooms] = useState(0);
  const [timestamp, setTimestamp] = useState<number | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchRooms();
    }
  }, [isOpen]);

  const fetchRooms = async () => {
    setLoading(true);
    setError(null);

    try {
      const serverUrl = import.meta.env.VITE_COLLABORATION_SERVER_URL || 'http://10.0.0.79:3000';
      const response = await fetch(`${serverUrl}/api/online-daw/rooms`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`서버 오류: ${response.status}`);
      }

      const data = await response.json();
      
      // 원시 응답 저장 (복사용)
      setRawResponse(data);
      
      // 응답 파싱: 다양한 형태 지원
      let parsedRooms: Room[] = [];
      let parsedTotalRooms = 0;
      let parsedTimestamp: number | null = null;
      
      // 배열 형태인 경우
      if (Array.isArray(data)) {
        // [{ success: true, data: { ... } }] 형태
        const firstItem = data[0];
        if (firstItem?.success && firstItem?.data) {
          parsedRooms = firstItem.data.rooms || [];
          parsedTotalRooms = firstItem.data.totalRooms || 0;
          parsedTimestamp = firstItem.data.timestamp || null;
        } else {
          // 단순 배열인 경우
          parsedRooms = data;
          parsedTotalRooms = data.length;
        }
      } 
      // 객체 형태인 경우
      else if (data && typeof data === 'object') {
        // { success: true, data: { ... } } 형태
        if (data.success && data.data) {
          parsedRooms = data.data.rooms || [];
          parsedTotalRooms = data.data.totalRooms || 0;
          parsedTimestamp = data.data.timestamp || null;
        }
        // { rooms: [...] } 형태
        else if (data.rooms && Array.isArray(data.rooms)) {
          parsedRooms = data.rooms;
          parsedTotalRooms = data.rooms.length;
        }
        // 단일 방 객체인 경우
        else if (data.roomCode) {
          parsedRooms = [data];
          parsedTotalRooms = 1;
        }
      }
      
      setRooms(parsedRooms);
      setTotalRooms(parsedTotalRooms);
      setTimestamp(parsedTimestamp);
    } catch (err) {
      setError(err instanceof Error ? err.message : '방 목록을 가져오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toLocaleString('ko-KR');
  };

  const handleCopyJson = async () => {
    try {
      // 원시 응답을 복사
      const jsonString = JSON.stringify(rawResponse, null, 2);
      await navigator.clipboard.writeText(jsonString);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (err) {
      console.error('Failed to copy JSON:', err);
      // 폴백: 텍스트 영역을 사용한 복사
      const textArea = document.createElement('textarea');
      textArea.value = JSON.stringify(rawResponse, null, 2);
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => {
          setCopied(false);
        }, 2000);
      } catch (fallbackErr) {
        console.error('Fallback copy failed:', fallbackErr);
      }
      document.body.removeChild(textArea);
    }
  };

  const handleRoomClick = async (room: Room) => {
    // 방 상세 정보 가져오기
    try {
      const serverUrl = import.meta.env.VITE_COLLABORATION_SERVER_URL || 'http://10.0.0.79:3000';
      const response = await fetch(`${serverUrl}/api/online-daw/rooms/${room.roomCode}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.roomCode) {
          setSelectedRoom(data as Room);
        } else {
          setSelectedRoom(room);
        }
      } else {
        // 상세 정보를 가져올 수 없으면 기본 정보 사용
        setSelectedRoom(room);
      }
    } catch (err) {
      console.error('Failed to fetch room details:', err);
      setSelectedRoom(room);
    }
  };

  const handleDeleteRoom = async (roomCode: string) => {
    if (!confirm(`방 "${roomCode}"을(를) 삭제하시겠습니까?`)) {
      return;
    }

    setDeleting(true);
    try {
      const serverUrl = import.meta.env.VITE_COLLABORATION_SERVER_URL || 'http://10.0.0.79:3000';
      const response = await fetch(`${serverUrl}/api/online-daw/rooms/${roomCode}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        // 방 목록 새로고침
        await fetchRooms();
        setSelectedRoom(null);
        alert('방이 삭제되었습니다.');
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || '방 삭제 실패');
      }
    } catch (err) {
      console.error('Failed to delete room:', err);
      alert(err instanceof Error ? err.message : '방 삭제 중 오류가 발생했습니다.');
    } finally {
      setDeleting(false);
    }
  };

  const handleCloseDetail = () => {
    setSelectedRoom(null);
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h3 className={styles.title}>방 목록</h3>
          <button className={styles.closeButton} onClick={onClose}>
            ×
          </button>
        </div>
        <div className={styles.content}>
          {loading && <div className={styles.loading}>로딩 중...</div>}
          {error && <div className={styles.error}>{error}</div>}
          {!loading && !error && !selectedRoom && (
            <>
              <div className={styles.summary}>
                <div className={styles.summaryItem}>
                  <span className={styles.summaryLabel}>Total Rooms:</span>
                  <span className={styles.summaryValue}>{totalRooms}</span>
                </div>
                {timestamp && (
                  <div className={styles.summaryItem}>
                    <span className={styles.summaryLabel}>Timestamp:</span>
                    <span className={styles.summaryValue}>{formatDate(timestamp)}</span>
                  </div>
                )}
              </div>
              {rooms.length === 0 ? (
                <div className={styles.empty}>방이 없습니다.</div>
              ) : (
                <div className={styles.roomsList}>
                  {rooms.map((room, index) => (
                    <div
                      key={index}
                      className={styles.roomListItem}
                      onClick={() => handleRoomClick(room)}
                    >
                      {room.roomCode}
                    </div>
                  ))}
                </div>
              )}
              <div className={styles.jsonContainer}>
                <div className={styles.jsonHeader}>
                  <div className={styles.jsonLabel}>JSON 복사:</div>
                  <button
                    className={styles.copyButton}
                    onClick={handleCopyJson}
                    title="JSON 복사"
                  >
                    {copied ? '복사됨!' : '복사'}
                  </button>
                </div>
              </div>
            </>
          )}
          {selectedRoom && (
            <div className={styles.roomDetail}>
              <div className={styles.roomDetailHeader}>
                <h4 className={styles.roomDetailTitle}>Room Code: {selectedRoom.roomCode}</h4>
                <button className={styles.backButton} onClick={handleCloseDetail}>
                  ← 목록
                </button>
              </div>
              <div className={styles.roomInfo}>
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>Host ID:</span>
                  <span className={styles.infoValue}>{selectedRoom.hostId}</span>
                </div>
                {selectedRoom.createdAt && (
                  <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>Created At:</span>
                    <span className={styles.infoValue}>{formatDate(selectedRoom.createdAt)}</span>
                  </div>
                )}
                {selectedRoom.expiresAt && (
                  <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>Expires At:</span>
                    <span className={styles.infoValue}>{formatDate(selectedRoom.expiresAt)}</span>
                  </div>
                )}
                {selectedRoom.minutesLeft !== undefined && (
                  <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>Minutes Left:</span>
                    <span className={styles.infoValue}>{selectedRoom.minutesLeft}</span>
                  </div>
                )}
                {selectedRoom.allowJoin !== undefined && (
                  <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>Allow Join:</span>
                    <span className={styles.infoValue}>{selectedRoom.allowJoin ? 'Yes' : 'No'}</span>
                  </div>
                )}
                {selectedRoom.allowJoinExpiresAt && (
                  <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>Allow Join Expires At:</span>
                    <span className={styles.infoValue}>{formatDate(selectedRoom.allowJoinExpiresAt)}</span>
                  </div>
                )}
                {selectedRoom.participantCount !== undefined && (
                  <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>Participant Count:</span>
                    <span className={styles.infoValue}>{selectedRoom.participantCount}</span>
                  </div>
                )}
                {selectedRoom.participants && selectedRoom.participants.length > 0 && (
                  <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>Participants:</span>
                    <span className={styles.infoValue}>{selectedRoom.participants.join(', ')}</span>
                  </div>
                )}
                {selectedRoom.maxParticipants !== undefined && (
                  <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>Max Participants:</span>
                    <span className={styles.infoValue}>{selectedRoom.maxParticipants}</span>
                  </div>
                )}
                {selectedRoom.connectedClients !== undefined && (
                  <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>Connected Clients:</span>
                    <span className={styles.infoValue}>{selectedRoom.connectedClients}</span>
                  </div>
                )}
                {selectedRoom.connectedClientIds && selectedRoom.connectedClientIds.length > 0 && (
                  <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>Connected Client IDs:</span>
                    <span className={styles.infoValue}>{selectedRoom.connectedClientIds.join(', ')}</span>
                  </div>
                )}
                {selectedRoom.clientConnections && selectedRoom.clientConnections.length > 0 && (
                  <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>Client Connections:</span>
                    <span className={styles.infoValue}>{selectedRoom.clientConnections.length}</span>
                  </div>
                )}
                {selectedRoom.status && (
                  <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>Status:</span>
                    <span className={styles.infoValue}>{selectedRoom.status}</span>
                  </div>
                )}
              </div>
              <div className={styles.roomDetailActions}>
                <button
                  className={styles.deleteButton}
                  onClick={() => handleDeleteRoom(selectedRoom.roomCode)}
                  disabled={deleting}
                >
                  {deleting ? '삭제 중...' : '방 삭제'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RoomsListModal;

