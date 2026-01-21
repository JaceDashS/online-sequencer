/**
 * CollaborationManager
 * SignalingClient와 WebRTCManager를 통합하여 전체 콜라보레이션 기능을 관리합니다.
 */

import { SignalingClient, type SignalingMessage } from './SignalingClient';
import { WebRTCManager } from './WebRTCManager';
import { SyncManager } from './SyncManager';
import { getOrCreateClientId } from './utils/uuid';
import type { P2PMessage, ConnectionState } from './types/p2p';

/**
 * 서버 → 클라이언트 메시지 (SignalingClient에서 import)
 */
type ServerToClientMessage = {
  action: 'connected' | 'registered' | 'joined' | 'signaling' | 'error' | 'room-closed' | 'kicked' | 'allow-join-expired' | 'room-expiring' | 'room-session-expired' | 'participant-joined' | 'participant-left';
  roomCode?: string;
  clientId?: string;
  data?: {
    status?: string;
    hostId?: string;
    participantId?: string;
    participantCount?: number;
    minutesLeft?: number;
    roomCreatedAt?: number;
    type?: 'offer' | 'answer' | 'ice-candidate';
    from?: string;
    sdp?: any;
    candidate?: any;
    [key: string]: any;
  };
  error?: string;
  timestamp?: number;
};

/**
 * CollaborationManager
 * 호스트와 게스트 모두에서 사용됩니다.
 */
export class CollaborationManager {
  private signalingClient: SignalingClient;
  private webRTCManager: WebRTCManager;
  private syncManager: SyncManager | null = null;
  private clientId: string;
  private isHost: boolean = false;
  private roomCode: string | null = null;
  private hostId: string | null = null;

  /**
   * 클라이언트 ID 반환
   */
  getClientId(): string {
    return this.clientId;
  }

  // P2P 메시지 콜백
  private p2pMessageCallbacks: Array<(message: P2PMessage) => void> = [];
  
  // 연결 상태 콜백
  private connectionStateCallbacks: Array<(peerId: string, state: ConnectionState) => void> = [];
  private seenP2PMessageIds = new Set<string>();
  
  // P2P 재연결 관련
  private p2pReconnectAttempts: Map<string, number> = new Map();
  private maxP2pReconnectAttempts: number = 3;
  private p2pReconnectTimers: Map<string, number> = new Map();

  private dispatchP2PMessage(message: P2PMessage): void {
    const messageId = `${message.from}-${message.timestamp}-${message.type}`;
    if (this.seenP2PMessageIds.has(messageId)) {
      return;
    }
    if (this.seenP2PMessageIds.size > 2000) {
      const firstKey = this.seenP2PMessageIds.values().next().value;
      if (firstKey !== undefined) {
        this.seenP2PMessageIds.delete(firstKey);
      }
    }
    this.seenP2PMessageIds.add(messageId);
    this.p2pMessageCallbacks.forEach(cb => cb(message));
  }

  private attachWebRTCMessageBridge(): void {
    this.webRTCManager.onMessage((message) => {
      this.dispatchP2PMessage(message);
    });
  }

  constructor(serverUrl?: string) {
    this.clientId = getOrCreateClientId();
    this.signalingClient = new SignalingClient(serverUrl);
    this.webRTCManager = new WebRTCManager(this.clientId, false); // 초기값: 게스트

    // SignalingClient로부터 시그널링 메시지 콜백
    this.signalingClient.onSignalingMessage((message) => {
      this.handleSignalingMessage(message);
    });

    // WebRTCManager로부터 시그널링 메시지 전송 콜백 설정
    this.webRTCManager.setSignalingCallback((message) => {
      this.sendSignalingMessage(message);
    });

    this.attachWebRTCMessageBridge();

    // 재연결 시 룸 상태 복원 콜백 등록
    this.signalingClient.onRoomRestore(async () => {
      await this.restoreRoomState();
    });

  }

  /**
   * 호스트: 룸 생성 및 호스팅 시작
   */
  async startHosting(): Promise<string> {
    if (this.isHost) {
      throw new Error('Already hosting');
    }


    const roomCode = await this.signalingClient.registerRoom(this.clientId);
    this.roomCode = roomCode;
    this.isHost = true;
    this.hostId = this.clientId;

    this.webRTCManager = new WebRTCManager(this.clientId, true);
    this.webRTCManager.setSignalingCallback((message) => {
      this.sendSignalingMessage(message);
    });

    this.attachWebRTCMessageBridge();

    this.syncManager = new SyncManager(this);

    return roomCode;
  }

  /**
   * 호스트: 조인 허용 활성화
   */
  async allowJoin(duration: number = 60): Promise<void> {
    if (!this.isHost || !this.roomCode) {
      throw new Error('Not hosting');
    }
    await this.signalingClient.allowJoin(this.roomCode, duration);
  }

  /**
   * 호스트: 참가자 강퇴
   */
  async kickParticipant(participantId: string): Promise<void> {
    if (!this.isHost || !this.roomCode) {
      throw new Error('Only host can kick participants');
    }
    
    // 서버에 강퇴 요청
    await this.signalingClient.kickParticipant(this.roomCode, participantId);
    
    // WebRTC 연결 종료
    this.webRTCManager.removeGuest(participantId);
    
  }

  /**
   * 게스트: 룸 참여
   */
  async joinRoom(roomCode: string): Promise<void> {
    if (this.isHost) {
      throw new Error('Host cannot join room');
    }


    // 룸 정보 조회
    const roomInfo = await this.signalingClient.getRoom(roomCode);
    if (!roomInfo.allowJoin) {
      throw new Error('Room is not accepting new participants');
    }

    this.roomCode = roomCode;
    this.hostId = roomInfo.hostId;

    // SignalingClient로 참여 요청
    const hostInfo = await this.signalingClient.joinRoom(roomCode);

    // Initialize SyncManager (guest mode)
    this.syncManager = new SyncManager(this);

    // Connect WebRTC
    try {
      await this.connectToHost(hostInfo.hostId);
    } catch (error) {
      this.syncManager?.disconnect();
      this.syncManager = null;
      throw error;
    }
  }

  /**
   * 게스트: 호스트와 P2P 연결
   */
  private async connectToHost(hostId: string): Promise<void> {

    // Offer 생성
    const offer = await this.webRTCManager.connectToHost(hostId);
    
    // Offer를 시그널링 서버를 통해 전송
    this.sendSignalingMessage({
      type: 'offer',
      from: this.clientId,
      to: hostId,
      data: { sdp: offer }
    });

    this.webRTCManager.onMessageFromHost((message) => {
      this.dispatchP2PMessage(message);
    });

    // 호스트로부터 메시지 수신 콜백 설정
    // Request initial state when DataChannel opens
    this.webRTCManager.onDataChannelOpen(hostId, () => {
      this.syncManager?.requestInitialState();
    });

    // 호스트 연결 상태 감지
    const currentHostId = this.hostId;
    if (currentHostId) {
      this.webRTCManager.onConnectionStateChange(currentHostId, (state) => {
        // 연결 상태 콜백 호출
        this.connectionStateCallbacks.forEach(cb => cb(currentHostId, state));
        
        if (state === 'disconnected' || state === 'failed') {
          // P2P 재연결 시도
          this.attemptP2PReconnect(currentHostId, 'guest').catch((error) => {
            console.error(`[CollaborationManager] P2P reconnect failed for host ${currentHostId}:`, error);
          });
        } else if (state === 'connected') {
          // 재연결 성공: 재시도 횟수 리셋
          this.p2pReconnectAttempts.delete(currentHostId);
          const timer = this.p2pReconnectTimers.get(currentHostId);
          if (timer) {
            clearTimeout(timer);
            this.p2pReconnectTimers.delete(currentHostId);
          }
        } else if (state === 'closed') {
          // 완전히 종료된 경우 재연결 시도하지 않음
          this.p2pReconnectAttempts.delete(currentHostId);
          const timer = this.p2pReconnectTimers.get(currentHostId);
          if (timer) {
            clearTimeout(timer);
            this.p2pReconnectTimers.delete(currentHostId);
          }
        }
      });
    }
  }

  /**
   * 호스트: 게스트와 P2P 연결 (게스트의 offer 수신)
   */
  private async handleGuestOffer(guestId: string, offer: RTCSessionDescriptionInit): Promise<void> {

    // Answer 생성
    const answer = await this.webRTCManager.addGuest(guestId, offer);

    this.webRTCManager.onMessageFromGuest(guestId, (message) => {
      this.dispatchP2PMessage(message);
    });

    // Register guest message handler
    // Answer를 시그널링 서버를 통해 전송
    this.sendSignalingMessage({
      type: 'answer',
      from: this.clientId,
      to: guestId,
      data: { sdp: answer }
    });

    // 게스트 연결 상태 감지
    this.webRTCManager.onConnectionStateChange(guestId, (state) => {
      
      // 연결 상태 콜백 호출
      this.connectionStateCallbacks.forEach(cb => cb(guestId, state));
      
      if (state === 'disconnected' || state === 'failed') {
        // P2P 재연결 시도
        this.attemptP2PReconnect(guestId, 'host').catch((error) => {
          console.error(`[CollaborationManager] P2P reconnect failed for guest ${guestId}:`, error);
        });
      } else if (state === 'connected') {
        // 재연결 성공: 재시도 횟수 리셋
        this.p2pReconnectAttempts.delete(guestId);
        const timer = this.p2pReconnectTimers.get(guestId);
        if (timer) {
          clearTimeout(timer);
          this.p2pReconnectTimers.delete(guestId);
        }
      } else if (state === 'closed') {
        // 완전히 종료된 경우 재연결 시도하지 않음
        this.p2pReconnectAttempts.delete(guestId);
        const timer = this.p2pReconnectTimers.get(guestId);
        if (timer) {
          clearTimeout(timer);
          this.p2pReconnectTimers.delete(guestId);
        }
      }
    });

    // DataChannel이 열렸을 때 게스트 상태 전송 (초기 상태)
    this.webRTCManager.onDataChannelOpen(guestId, () => {
      // 게스트 상태 전송
      if (this.syncManager) {
        this.syncManager.onGuestConnected(guestId);
      }
    });
  }

  /**
   * 시그널링 메시지 처리
   */
  private async handleSignalingMessage(message: SignalingMessage): Promise<void> {

    // 자신에게 온 메시지만 처리
    if (message.to !== this.clientId) {
      return;
    }

    if (this.isHost) {
      // 호스트: 게스트로부터 offer 받거나 ICE candidate 수신
      if (message.type === 'offer') {
        await this.handleGuestOffer(message.from, message.data.sdp!);
      } else if (message.type === 'ice-candidate') {
        await this.webRTCManager.addIceCandidate(message.from, message.data.candidate!);
      }
    } else {
      // 게스트: 호스트로부터 answer 받거나 ICE candidate 수신
      if (message.type === 'answer') {
        await this.webRTCManager.setHostAnswer(message.data.sdp!);
      } else if (message.type === 'ice-candidate') {
        await this.webRTCManager.addIceCandidate(message.from, message.data.candidate!);
      }
    }
  }

  /**
   * 시그널링 메시지 전송
   */
  private sendSignalingMessage(message: { type: 'offer' | 'answer' | 'ice-candidate'; from: string; to: string; data: any }): void {
    if (!this.roomCode) {
      console.warn('[CollaborationManager] Cannot send signaling message: no room code');
      return;
    }

    const signalingMessage: SignalingMessage = {
      type: message.type,
      from: message.from,
      to: message.to,
      roomCode: this.roomCode,
      data: message.data,
      timestamp: Date.now()
    };

    this.signalingClient.sendSignalingMessage(signalingMessage);
  }

  /**
   * 호스트: 게스트에게 메시지 전송
   */
  sendToGuest(guestId: string, message: P2PMessage): void {
    if (!this.isHost) {
      throw new Error('Only host can send to guests');
    }
    this.webRTCManager.sendToGuest(guestId, message);
  }

  /**
   * 호스트: 모든 게스트에게 브로드캐스트
   */
  broadcastToAll(message: P2PMessage): void {
    if (!this.isHost) {
      throw new Error('Only host can broadcast');
    }
    this.webRTCManager.broadcastToAll(message);
  }

  /**
   * 호스트: 다른 게스트에게 브로드캐스트 (자신 제외)
   */
  broadcastToOthers(senderId: string, message: P2PMessage): void {
    if (!this.isHost) {
      throw new Error('Only host can broadcast to others');
    }
    this.webRTCManager.broadcastToOthers(senderId, message);
  }

  /**
   * 게스트: 호스트에게 메시지 전송
   */
  sendToHost(message: P2PMessage): void {
    if (this.isHost) {
      throw new Error('Host cannot send to host');
    }
    this.webRTCManager.sendToHost(message);
  }

  /**
   * P2P 메시지 수신 콜백 등록
   */
  onP2PMessage(callback: (message: P2PMessage) => void): void {
    this.p2pMessageCallbacks.push(callback);
  }

  /**
   * P2P 메시지 수신 콜백 제거
   */
  offP2PMessage(callback: (message: P2PMessage) => void): void {
    const index = this.p2pMessageCallbacks.indexOf(callback);
    if (index !== -1) {
      this.p2pMessageCallbacks.splice(index, 1);
    }
  }

  /**
   * 연결 상태 변화 콜백 등록
   */
  onConnectionStateChange(callback: (peerId: string, state: ConnectionState) => void): void {
    this.connectionStateCallbacks.push(callback);
  }

  /**
   * 연결 상태 변화 콜백 제거
   */
  offConnectionStateChange(callback: (peerId: string, state: ConnectionState) => void): void {
    const index = this.connectionStateCallbacks.indexOf(callback);
    if (index !== -1) {
      this.connectionStateCallbacks.splice(index, 1);
    }
  }

  /**
   * 서버 메시지 수신 콜백 등록 (SignalingClient의 onMessage를 래핑)
   */
  onServerMessage(action: string, callback: (message: ServerToClientMessage) => void): void {
    this.signalingClient.onMessage(action, callback);
  }

  /**
   * 서버 메시지 콜백 제거 (SignalingClient의 offMessage를 래핑)
   */
  offServerMessage(action: string, callback: (message: ServerToClientMessage) => void): void {
    this.signalingClient.offMessage(action, callback);
  }

  /**
   * SignalingClient에 연결 (WebSocket 연결)
   */
  async connect(): Promise<void> {
    await this.signalingClient.connect();
  }

  /**
   * SignalingClient 연결 상태 확인
   */
  get connected(): boolean {
    return this.signalingClient.connected;
  }

  /**
   * 연결 종료
   */
  disconnect(): void {

    if (this.isHost && this.roomCode) {
      // 호스트: 룸 삭제
      this.signalingClient.deleteRoom(this.roomCode).catch((err: Error) => {
        console.error('[CollaborationManager] Failed to delete room:', err);
      });
    }
    // 게스트는 SignalingClient.disconnect()가 자동으로 leave 메시지를 전송

    // WebRTC 연결 종료
    this.webRTCManager.disconnect();

    // SignalingClient 연결 종료 (게스트는 자동으로 leave 메시지 전송)
    this.signalingClient.disconnect();

    // SyncManager 정리
    this.syncManager = null;

    // 상태 초기화
    this.isHost = false;
    this.roomCode = null;
    this.hostId = null;
    this.p2pMessageCallbacks = [];
    this.connectionStateCallbacks = [];
    this.seenP2PMessageIds.clear();
    
    // 재연결 타이머 정리
    this.p2pReconnectTimers.forEach(timer => clearTimeout(timer));
    this.p2pReconnectTimers.clear();
    this.p2pReconnectAttempts.clear();

  }

  /**
   * 호스트 여부 확인
   */
  getIsHost(): boolean {
    return this.isHost;
  }

  /**
   * 룸 코드 반환
   */
  getRoomCode(): string | null {
    return this.roomCode;
  }

  /**
   * 호스트 ID 반환
   */
  getHostId(): string | null {
    return this.hostId;
  }

  /**
   * 연결된 게스트 목록 반환 (호스트용)
   */
  getConnectedGuests(): string[] {
    if (!this.isHost) {
      return [];
    }
    return this.webRTCManager.getConnectedGuests();
  }

  /**
   * 호스트 연결 상태 반환 (게스트용)
   */
  getHostConnectionState(): ConnectionState | null {
    if (this.isHost) {
      return null;
    }
    return this.webRTCManager.getHostConnectionState();
  }

  /**
   * 게스트 연결 상태 반환 (호스트용)
   */
  getGuestConnectionState(guestId: string): ConnectionState | null {
    if (!this.isHost) {
      return null;
    }
    return this.webRTCManager.getPeerConnectionState(guestId);
  }

  /**
   * 재연결 시 룸 상태 복원
   */
  private async restoreRoomState(): Promise<void> {
    if (!this.roomCode) {
      return;
    }

    try {
      if (this.isHost) {
        // 호스트: 룸에 다시 등록
        // 서버 재시작 시 룸이 없을 수 있으므로 새 룸 생성
        const newRoomCode = await this.signalingClient.registerRoom(this.clientId);
        if (newRoomCode !== this.roomCode) {
          // 룸 코드가 변경되었음 (서버 재시작으로 인한)
          console.warn(`[CollaborationManager] Room code changed after server restart: ${this.roomCode} -> ${newRoomCode}`);
          this.roomCode = newRoomCode;
          // 호스트는 새 룸 코드로 계속 진행 (게스트는 수동으로 새 룸에 조인해야 함)
        }
      } else {
        // 게스트: 룸에 다시 조인
        await this.signalingClient.joinRoom(this.roomCode);
        // P2P 재연결은 별도로 처리 (P2P 재연결 로직에서)
      }
    } catch (error) {
      // "Room not found" 에러는 서버 재시작으로 인한 것으로 간주
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('Room not found') || errorMessage.includes('404')) {
        console.warn(`[CollaborationManager] Room ${this.roomCode} not found after server restart. Room state cannot be restored.`);
        // 룸 코드 초기화하여 사용자가 수동으로 새 룸에 조인할 수 있도록 함
        this.roomCode = null;
        this.isHost = false;
        this.hostId = null;
        // 에러를 다시 throw하지 않음 (조용히 처리)
        return;
      }
      // 다른 에러는 그대로 throw
      console.error('[CollaborationManager] Failed to restore room state:', error);
      throw error;
    }
  }

  /**
   * P2P 재연결 시도
   * @internal
   */
  async attemptP2PReconnect(peerId: string, role: 'host' | 'guest'): Promise<void> {
    const attempts = this.p2pReconnectAttempts.get(peerId) || 0;
    
    if (attempts >= this.maxP2pReconnectAttempts) {
      console.warn(`[CollaborationManager] Max P2P reconnect attempts reached for ${peerId}`);
      return;
    }

    // 이미 재연결 시도 중이면 스킵
    if (this.p2pReconnectTimers.has(peerId)) {
      return;
    }

    this.p2pReconnectAttempts.set(peerId, attempts + 1);
    
    // 지수 백오프: 1초, 2초, 4초
    const delay = 1000 * Math.pow(2, attempts);
    
    const timer = window.setTimeout(async () => {
      this.p2pReconnectTimers.delete(peerId);
      
      try {
        if (role === 'host') {
          // 호스트: 게스트의 offer를 기다림 (게스트가 재연결 시도)
          // 여기서는 게스트가 재연결을 시도하도록 기다림
        } else {
          // 게스트: 호스트에게 재연결 시도
          if (!this.hostId) {
            throw new Error('Host ID not available');
          }
          
          await this.connectToHost(this.hostId);
        }
      } catch (error) {
        console.error(`[CollaborationManager] P2P reconnect attempt ${attempts + 1} failed:`, error);
        // 재시도는 다음 연결 상태 변화에서 트리거됨
      }
    }, delay);
    
    this.p2pReconnectTimers.set(peerId, timer);
  }
}
