/**
 * P2P 메시지 타입 정의
 * WebRTC DataChannel을 통해 전송되는 메시지 타입들
 */

/**
 * P2P 메시지 기본 타입
 */
export interface P2PMessage {
  type: 'change' | 'initial-state' | 'state-request' | 'transport' | 'ping' | 'pong' | 'error';
  from: string; // 발신자 ID
  to?: string; // 수신자 ID (없으면 브로드캐스트)
  timestamp: number;
  data?: any;
}

/**
 * 프로젝트 변경사항 메시지
 */
export interface ChangeMessage extends P2PMessage {
  type: 'change';
  data: {
    change: RemoteChange;
    sequence?: number; // 메시지 순서 번호
  };
}

/**
 * 초기 상태 동기화 메시지
 */
export interface InitialStateMessage extends P2PMessage {
  type: 'initial-state';
  data: {
    projectState: any; // 프로젝트 전체 상태
    isInitial: boolean; // 초기 동기화 플래그
  };
}

/**
 * 원격 변경사항 타입
 */
export interface RemoteChange {
  type: 'channel-volume' | 'channel-pan' | 'channel-effect' | 'master-volume' | 'master-pan' | 'master-effect' | 'midi-part' | 'midi-note' | 'time-signature' | 'bpm';
  trackId?: string;
  partId?: string;
  noteId?: string;
  value: any;
  timestamp: number;
  clientId: string;
}

export interface TransportMessage extends P2PMessage {
  type: 'transport';
  data: {
    action: 'play' | 'pause' | 'stop' | 'seek';
    time: number;
  };
}

/**
 * 연결 상태 타입
 */
export type ConnectionState = 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed';

/**
 * Peer 정보
 */
export interface PeerInfo {
  id: string;
  state: ConnectionState;
  connection?: RTCPeerConnection;
  dataChannel?: RTCDataChannel;
}

