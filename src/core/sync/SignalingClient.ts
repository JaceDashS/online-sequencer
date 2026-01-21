/**
 * SignalingClient
 * 서버와의 WebSocket 연결 및 시그널링 메시지 처리를 담당합니다.
 */

import { getOrCreateClientId } from './utils/uuid';

/**
 * 시그널링 메시지 타입 (WebRTC용)
 */
export interface SignalingMessage {
  type: 'offer' | 'answer' | 'ice-candidate';
  from: string;
  to: string;
  roomCode: string;
  data: {
    sdp?: RTCSessionDescriptionInit;
    candidate?: RTCIceCandidateInit;
  };
  timestamp: number;
}

/**
 * 서버 → 클라이언트 메시지
 */
interface ServerToClientMessage {
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
}

/**
 * 룸 정보
 */
export interface RoomInfo {
  success: boolean;
  roomCode: string;
  hostId: string;
  status: 'active' | 'expired';
  allowJoin: boolean;
  allowJoinExpiresAt: number | null;
  participantCount: number;
  maxParticipants: number;
  createdAt: number;
  expiresAt: number;
  error?: string;
}

/**
 * 호스트 정보
 */
export interface HostInfo {
  hostId: string;
  roomCode: string;
}

/**
 * SignalingClient 클래스
 */
export class SignalingClient {
  private ws: WebSocket | null = null;
  private serverUrl: string;
  private wsUrl: string;
  private apiBaseUrl: string;
  private clientId: string;
  private roomCode: string | null = null;
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 1000; // 1초
  private reconnectTimer: number | null = null;
  private signalingCallbacks: Array<(message: SignalingMessage) => void> = [];
  private messageCallbacks: Map<string, Array<(message: ServerToClientMessage) => void>> = new Map();
  
  // 재연결 시 룸 상태 복원 콜백
  private roomRestoreCallbacks: Array<() => Promise<void>> = [];

  constructor(serverUrl?: string) {
    // 환경 변수에서 서버 URL 가져오기
    this.serverUrl = serverUrl || import.meta.env.VITE_COLLABORATION_SERVER_URL || 'http://10.0.0.79:3000';
    this.wsUrl = import.meta.env.VITE_COLLABORATION_WS_URL || this.serverUrl.replace('http://', 'ws://').replace('https://', 'wss://');
    this.apiBaseUrl = import.meta.env.VITE_API_BASE_URL || `${this.serverUrl}/api/online-daw`;
    this.clientId = getOrCreateClientId();
  }

  /**
   * WebSocket 연결
   */
  async connect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return; // 이미 연결됨
    }

    return new Promise((resolve, reject) => {
      const wsUrl = `${this.wsUrl}/api/online-daw/signaling?clientId=${this.clientId}`;      
      try {
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          this.isConnected = true;
          this.reconnectAttempts = 0;
          
          // 재연결 시 룸 상태 복원
          if (this.roomCode) {
            this.restoreRoomState().catch((error) => {
              console.error('[SignalingClient] Failed to restore room state:', error);
            });
          }
          
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message: ServerToClientMessage = JSON.parse(event.data);            this.handleMessage(message);
          } catch (error) {
            console.error('[SignalingClient] Error parsing message:', error);
          }
        };

        this.ws.onerror = (error) => {
          console.error('[SignalingClient] WebSocket error:', error);
          console.error('[SignalingClient] WebSocket URL:', wsUrl);
          reject(error);
        };

        this.ws.onclose = () => {
          this.isConnected = false;          
          // 자동 재연결 시도
          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.scheduleReconnect();
          }
        };
      } catch (error) {
        console.error('[SignalingClient] Failed to create WebSocket:', error);
        reject(error);
      }
    });
  }

  /**
   * 재연결 스케줄링
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) {
      return; // 이미 스케줄됨
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1); // 지수 백오프
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch((error) => {
        console.error('[SignalingClient] Reconnect failed:', error);
      });
    }, delay);
  }

  /**
   * 서버 메시지 처리
   */
  private handleMessage(message: ServerToClientMessage): void {
    console.log('[SignalingClient] Message received:', { action: message.action, roomCode: message.roomCode, error: message.error });
    
    // 특정 액션에 대한 콜백 호출
    const callbacks = this.messageCallbacks.get(message.action);
    if (callbacks) {
      console.log('[SignalingClient] Calling callbacks for action:', message.action, 'count:', callbacks.length);
      callbacks.forEach(callback => callback(message));
    } else {
      console.log('[SignalingClient] No callbacks registered for action:', message.action);
    }

    // 시그널링 메시지 처리
    if (message.action === 'signaling' && message.data) {
      const signalingMessage: SignalingMessage = {
        type: message.data.type!,
        from: message.data.from!,
        to: this.clientId,
        roomCode: message.roomCode!,
        data: {
          sdp: message.data.sdp,
          candidate: message.data.candidate
        },
        timestamp: message.timestamp || Date.now()
      };

      this.signalingCallbacks.forEach(callback => callback(signalingMessage));
    }

    // 에러 처리
    if (message.action === 'error') {
      console.error('[SignalingClient] Server error:', message.error);
    }
  }

  /**
   * 룸 상태 복원 (재연결 시)
   */
  private async restoreRoomState(): Promise<void> {
    if (!this.roomCode) {
      return;
    }

    // 룸 상태 복원 콜백 실행
    for (const callback of this.roomRestoreCallbacks) {
      try {
        await callback();
      } catch (error) {
        console.error('[SignalingClient] Room restore callback failed:', error);
      }
    }
  }

  /**
   * 룸 상태 복원 콜백 등록
   */
  onRoomRestore(callback: () => Promise<void>): void {
    this.roomRestoreCallbacks.push(callback);
  }

  /**
   * 룸 상태 복원 콜백 제거
   */
  offRoomRestore(callback: () => Promise<void>): void {
    const index = this.roomRestoreCallbacks.indexOf(callback);
    if (index > -1) {
      this.roomRestoreCallbacks.splice(index, 1);
    }
  }

  /**
   * 룸 생성 (호스트)
   */
  async registerRoom(hostId: string): Promise<string> {    
    // WebSocket 연결 확인
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {      await this.connect();
    }

    // REST API로 룸 생성
    const url = `${this.apiBaseUrl}/rooms`;    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Id': this.clientId,
        'X-Host-Id': hostId
      },
      body: JSON.stringify({ hostId })
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to create room' }));
      console.error('[SignalingClient] Room creation failed:', error);
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    console.log('[SignalingClient] Room creation response:', data);
    
    const roomCode = data.roomCode;
    console.log('[SignalingClient] Extracted roomCode:', roomCode);

    if (!roomCode) {
      console.error('[SignalingClient] Room creation response missing roomCode:', data);
      throw new Error('Room creation failed: roomCode not returned');
    }

    // WebSocket으로 룸 등록
    this.roomCode = roomCode;
    console.log('[SignalingClient] Sending register message with roomCode:', roomCode);
    const registerMessage = {
      action: 'register',
      roomCode,
      clientId: this.clientId,
      data: {
        role: 'host'
      }
    };
    console.log('[SignalingClient] Register message to send:', JSON.stringify(registerMessage));
    this.sendWebSocketMessage(registerMessage);

    // 등록 확인 대기
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Registration timeout'));
      }, 5000);

      const callback = (message: ServerToClientMessage) => {
        console.log('[SignalingClient] Registered callback received message:', { action: message.action, roomCode: message.roomCode, expectedRoomCode: roomCode });
        if (message.action === 'registered' && message.roomCode === roomCode) {
          console.log('[SignalingClient] Registration confirmed for roomCode:', roomCode);
          clearTimeout(timeout);
          this.offMessage('registered', callback);
          resolve(roomCode);
        } else if (message.action === 'error') {
          console.log('[SignalingClient] Registration error received:', message.error);
          clearTimeout(timeout);
          this.offMessage('registered', callback);
          reject(new Error(message.error || 'Registration failed'));
        } else {
          console.log('[SignalingClient] Ignoring message in registered callback:', { action: message.action, roomCode: message.roomCode });
        }
      };

      console.log('[SignalingClient] Registering callback for "registered" action, waiting for roomCode:', roomCode);
      this.onMessage('registered', callback);
    });
  }

  /**
   * 룸 정보 조회
   */
  async getRoom(roomCode: string): Promise<RoomInfo> {
    const response = await fetch(`${this.apiBaseUrl}/rooms/${roomCode}`, {
      method: 'GET',
      headers: {
        'X-Client-Id': this.clientId
      }
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to get room' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return await response.json();
  }

  /**
   * 조인 허용 활성화 (호스트)
   */
  async allowJoin(roomCode: string, duration: number = 60): Promise<void> {
    const response = await fetch(`${this.apiBaseUrl}/rooms/${roomCode}/allow-join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Id': this.clientId
      },
      body: JSON.stringify({ duration })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to allow join' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }
  }

  /**
   * 룸 참여 (참가자)
   */
  async joinRoom(roomCode: string): Promise<HostInfo> {
    // WebSocket 연결 확인
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connect();
    }

    // 룸 정보 확인
    const roomInfo = await this.getRoom(roomCode);
    
    if (!roomInfo.success) {
      throw new Error(roomInfo.error || 'Room not found');
    }

    if (!roomInfo.allowJoin) {
      throw new Error('Room is not accepting new participants');
    }

    // WebSocket으로 룸 조인
    this.roomCode = roomCode;
    this.sendWebSocketMessage({
      action: 'join',
      roomCode,
      clientId: this.clientId,
      data: {
        role: 'participant'
      }
    });

    // 조인 확인 대기
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Join timeout'));
      }, 5000);

      const callback = (message: ServerToClientMessage) => {
        if (message.action === 'joined' && message.roomCode === roomCode && message.data?.hostId) {
          clearTimeout(timeout);
          this.offMessage('joined', callback);
          resolve({
            hostId: message.data.hostId,
            roomCode
          });
        } else if (message.action === 'error' && message.roomCode === roomCode) {
          clearTimeout(timeout);
          this.offMessage('joined', callback);
          reject(new Error(message.error || 'Join failed'));
        }
      };

      this.onMessage('joined', callback);
    });
  }

  /**
   * 참가자 강퇴 (호스트)
   */
  async kickParticipant(roomCode: string, participantId: string): Promise<void> {
    const response = await fetch(`${this.apiBaseUrl}/rooms/${roomCode}/kick`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Id': this.clientId
      },
      body: JSON.stringify({ participantId })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to kick participant' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }
  }

  /**
   * 룸 삭제 (호스트)
   */
  async deleteRoom(roomCode: string): Promise<void> {    
    const response = await fetch(`${this.apiBaseUrl}/rooms/${roomCode}`, {
      method: 'DELETE',
      headers: {
        'X-Client-Id': this.clientId
      }
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to delete room' }));
      console.error('[SignalingClient] Room deletion failed:', error);
      throw new Error(error.error || `HTTP ${response.status}`);
    }    
    // 룸 코드 초기화
    this.roomCode = null;
  }

  /**
   * 시그널링 메시지 전송
   */
  sendSignalingMessage(message: SignalingMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }

    this.sendWebSocketMessage({
      action: 'signaling',
      roomCode: message.roomCode,
      clientId: this.clientId,
      data: {
        type: message.type,
        to: message.to,
        sdp: message.data.sdp,
        candidate: message.data.candidate
      }
    });
  }

  /**
   * 시그널링 메시지 수신 콜백 등록
   */
  onSignalingMessage(callback: (message: SignalingMessage) => void): void {
    this.signalingCallbacks.push(callback);
  }

  /**
   * 시그널링 메시지 콜백 제거
   */
  offSignalingMessage(callback: (message: SignalingMessage) => void): void {
    const index = this.signalingCallbacks.indexOf(callback);
    if (index > -1) {
      this.signalingCallbacks.splice(index, 1);
    }
  }

  /**
   * 서버 메시지 수신 콜백 등록
   */
  onMessage(action: string, callback: (message: ServerToClientMessage) => void): void {
    if (!this.messageCallbacks.has(action)) {
      this.messageCallbacks.set(action, []);
    }
    this.messageCallbacks.get(action)!.push(callback);
  }

  /**
   * 서버 메시지 콜백 제거
   */
  offMessage(action: string, callback: (message: ServerToClientMessage) => void): void {
    const callbacks = this.messageCallbacks.get(action);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  /**
   * WebSocket 메시지 전송
   */
  private sendWebSocketMessage(message: any): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('[SignalingClient] WebSocket is not connected, readyState:', this.ws?.readyState);
      throw new Error('WebSocket is not connected');
    }

    const messageStr = JSON.stringify(message);
    console.log('[SignalingClient] Sending WebSocket message:', messageStr);
    this.ws.send(messageStr);
  }

  /**
   * 연결 종료
   */
  disconnect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.roomCode) {
      // 룸 나가기 메시지 전송
      this.sendWebSocketMessage({
        action: 'leave',
        roomCode: this.roomCode,
        clientId: this.clientId
      });
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.isConnected = false;
    this.roomCode = null;
  }

  /**
   * 현재 연결 상태
   */
  get connected(): boolean {
    return this.isConnected && this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * 현재 룸 코드
   */
  get currentRoomCode(): string | null {
    return this.roomCode;
  }

  /**
   * 클라이언트 ID
   */
  get id(): string {
    return this.clientId;
  }
}


