/**
 * SignalingClient
 * 서버와의 WebSocket 연결 및 시그널링 메시지 처리를 담당합니다.
 */

import { getOrCreateClientId } from './utils/uuid';
import { getTransport } from '../../transport';
import type { ITransport, IWebSocket } from '../../transport';
import { buildApiUrl, buildWebSocketUrl } from '../../utils/apiConfig';

/**
 * 상세 로그 출력 여부 확인
 */
const isVerboseLogging = (): boolean => {
  return import.meta.env.VITE_LOG_VERBOSE === 'true' || import.meta.env.LOG_VERBOSE === 'true';
};

/**
 * 상세 로그 출력 헬퍼
 */
const verboseLog = (message: string, ...args: any[]): void => {
  if (isVerboseLogging()) {
    console.log(`[SignalingClient] ${message}`, ...args);
  }
};

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
  private transport: ITransport;
  private ws: IWebSocket | null = null;
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
  
  // 중복 연결 방지: 연결 중인 Promise 저장
  private connectingPromise: Promise<void> | null = null;

  constructor(_serverUrl?: string) {
    // Transport 인스턴스 가져오기 (플랫폼 자동 감지)
    this.transport = getTransport();
    
    // VITE_API_BASE_URL은 apiConfig 유틸리티를 통해 직접 사용
    // 모든 API 요청은 buildApiUrl() 및 buildWebSocketUrl() 함수를 통해 생성됨
    
    this.clientId = getOrCreateClientId();
  }

  /**
   * WebSocket 연결
   */
  async connect(): Promise<void> {
    const OPEN = 1; // WebSocket.OPEN 상수
    const CONNECTING = 0; // WebSocket.CONNECTING 상수
    
    // 이미 연결되어 있으면 즉시 반환
    if (this.ws && this.ws.readyState === OPEN) {
      return; // 이미 연결됨
    }

    // 이미 연결 중이면 기존 Promise 반환 (중복 연결 방지)
    if (this.connectingPromise) {
      verboseLog('[SignalingClient] Connection already in progress, waiting...');
      return this.connectingPromise;
    }

    // CONNECTING 상태일 때도 기존 연결 완료 대기
    if (this.ws && this.ws.readyState === CONNECTING) {
      verboseLog('[SignalingClient] WebSocket is connecting, waiting for completion...');
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('WebSocket connection timeout: Unable to connect to server. Please check your connection and try again.'));
        }, 10000);

        const originalOnOpen = this.ws!.onopen;
        this.ws!.onopen = () => {
          clearTimeout(timeout);
          if (originalOnOpen) {
            originalOnOpen();
          }
          resolve();
        };

        const originalOnError = this.ws!.onerror;
        this.ws!.onerror = (error) => {
          clearTimeout(timeout);
          if (originalOnError) {
            originalOnError(error);
          }
          reject(new Error('WebSocket connection failed. Please check your connection and try again.'));
        };
      });
    }

    // VITE_API_BASE_URL을 기반으로 WebSocket URL 생성
    const wsUrl = buildWebSocketUrl('/signaling', { clientId: this.clientId });
    verboseLog('Connecting to WebSocket:', wsUrl);
    
    // WebSocket 연결 타임아웃 (10초)
    let resolveOpen: (() => void) | null = null;
    let rejectOpen: ((error: Error) => void) | null = null;
    const openPromise = new Promise<void>((resolve, reject) => {
      resolveOpen = resolve;
      rejectOpen = reject;
    });
    const connectionTimeout = setTimeout(() => {
      if (this.ws && this.ws.readyState !== OPEN) {
        this.ws.close();
        console.error('[SignalingClient] WebSocket connection timeout');
        this.connectingPromise = null; // Promise 초기화
        rejectOpen?.(new Error('WebSocket connection timeout: Unable to connect to server. Please check your connection and try again.'));
      }
    }, 10000);
    
    // 연결 Promise 생성 (중복 방지)
    this.connectingPromise = (async () => {
      try {
        // Transport를 통해 WebSocket 연결
        this.ws = await this.transport.connectWebSocket(wsUrl);

        this.ws.onopen = () => {
          clearTimeout(connectionTimeout);
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.connectingPromise = null; // 연결 완료 시 Promise 초기화
          verboseLog('WebSocket connection opened');
          
          // 재연결 시 룸 상태 복원
          if (this.roomCode) {
            this.restoreRoomState().catch((error) => {
              console.error('[SignalingClient] Failed to restore room state:', error);
            });
          }
          resolveOpen?.();
        };

        this.ws.onmessage = (event) => {
          try {
            const message: ServerToClientMessage = JSON.parse(event.data);
            verboseLog('Received message:', JSON.stringify(message, null, 2));
            this.handleMessage(message);
          } catch (error) {
            console.error('[SignalingClient] Error parsing message:', error);
          }
        };

        this.ws.onerror = (error) => {
          clearTimeout(connectionTimeout);
          this.connectingPromise = null; // 에러 시 Promise 초기화
          console.error('[SignalingClient] WebSocket error:', error);
          rejectOpen?.(new Error('WebSocket connection failed. Please check your connection and try again.'));
        };

        this.ws.onclose = () => {
          clearTimeout(connectionTimeout);
          this.isConnected = false;
          this.connectingPromise = null; // 종료 시 Promise 초기화
          // 자동 재연결 시도
          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.scheduleReconnect();
          }
        };

        // 이미 OPEN 상태인 경우(예: Electron Transport) 즉시 처리
        if (this.ws.readyState === OPEN) {
          this.ws.onopen?.();
        }

        return openPromise;
      } catch (error) {
        clearTimeout(connectionTimeout);
        this.connectingPromise = null; // 에러 시 Promise 초기화
        console.error('[SignalingClient] Failed to create WebSocket:', error);
        throw error instanceof Error ? error : new Error('Failed to create WebSocket connection');
      }
    })();

    return this.connectingPromise;
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
    verboseLog(`Handling message action: ${message.action}`, message);
    
    // 특정 액션에 대한 콜백 호출
    const callbacks = this.messageCallbacks.get(message.action);
    if (callbacks) {
      callbacks.forEach(callback => callback(message));
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
    const OPEN = 1; // WebSocket.OPEN 상수
    // WebSocket 연결 확인
    if (!this.isConnected || !this.ws || this.ws.readyState !== OPEN) {
      await this.connect();
    }

    // REST API로 룸 생성 (타임아웃 처리)
    const url = buildApiUrl('/rooms');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10초 타임아웃
    
    let roomCode: string;
    
    try {
      const response = await this.transport.request({
        url,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Id': this.clientId,
          'X-Host-Id': hostId
        },
        body: JSON.stringify({ hostId }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const error = (await response.json().catch(() => ({ error: 'Failed to create room' }))) as { error?: string };
        console.error('[SignalingClient] Room creation failed:', error);
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      const data = (await response.json()) as { roomCode: string };
      
      roomCode = data.roomCode;

      if (!roomCode) {
        throw new Error('Room creation failed: roomCode not returned');
      }
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('Server did not respond. Please check your connection and try again.');
      }
      throw err;
    }

    // WebSocket으로 룸 등록
    this.roomCode = roomCode;
    const registerMessage = {
      action: 'register',
      roomCode,
      clientId: this.clientId,
      data: {
        role: 'host'
      }
    };
    verboseLog('Sending register message:', JSON.stringify(registerMessage, null, 2));
    this.sendWebSocketMessage(registerMessage);

    // 등록 확인 대기
    return new Promise((resolve, reject) => {
      const callback = (message: ServerToClientMessage) => {
        if (message.action === 'registered' && message.roomCode === roomCode) {
          clearTimeout(timeout);
          this.offMessage('registered', callback);
          resolve(roomCode);
        } else if (message.action === 'error') {
          clearTimeout(timeout);
          this.offMessage('registered', callback);
          reject(new Error(message.error || 'Registration failed'));
        }
      };

      const timeout = setTimeout(() => {
        this.offMessage('registered', callback);
        reject(new Error('Registration timeout: Server did not respond within 5 seconds. Please check your connection and try again.'));
      }, 5000);

      this.onMessage('registered', callback);
    });
  }

  /**
   * 룸 정보 조회
   */
  async getRoom(roomCode: string): Promise<RoomInfo> {
    const response = await this.transport.request({
      url: buildApiUrl(`/rooms/${roomCode}`),
      method: 'GET',
      headers: {
        'X-Client-Id': this.clientId
      }
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({ error: 'Failed to get room' }))) as { error?: string };
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return (await response.json()) as RoomInfo;
  }

  /**
   * 조인 허용 활성화 (호스트)
   */
  async allowJoin(roomCode: string, duration: number = 60): Promise<void> {
    const response = await this.transport.request({
      url: buildApiUrl(`/rooms/${roomCode}/allow-join`),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Id': this.clientId
      },
      body: JSON.stringify({ duration })
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({ error: 'Failed to allow join' }))) as { error?: string };
      throw new Error(error.error || `HTTP ${response.status}`);
    }
  }

  /**
   * 룸 참여 (참가자)
   */
  async joinRoom(roomCode: string): Promise<HostInfo> {
    const OPEN = 1; // WebSocket.OPEN 상수
    // WebSocket 연결 확인
    if (!this.isConnected || !this.ws || this.ws.readyState !== OPEN) {
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
    const joinMessage = {
      action: 'join',
      roomCode,
      clientId: this.clientId,
      data: {
        role: 'participant'
      }
    };
    verboseLog('Sending join message:', JSON.stringify(joinMessage, null, 2));
    this.sendWebSocketMessage(joinMessage);

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
    const response = await this.transport.request({
      url: buildApiUrl(`/rooms/${roomCode}/kick`),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Id': this.clientId
      },
      body: JSON.stringify({ participantId })
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({ error: 'Failed to kick participant' }))) as { error?: string };
      throw new Error(error.error || `HTTP ${response.status}`);
    }
  }

  /**
   * 룸 삭제 (호스트)
   */
  async deleteRoom(roomCode: string): Promise<void> {    
    const response = await this.transport.request({
      url: buildApiUrl(`/rooms/${roomCode}`),
      method: 'DELETE',
      headers: {
        'X-Client-Id': this.clientId
      }
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({ error: 'Failed to delete room' }))) as { error?: string };
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
    const OPEN = 1; // WebSocket.OPEN 상수
    if (!this.ws || this.ws.readyState !== OPEN) {
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
    const OPEN = 1; // WebSocket.OPEN 상수
    if (!this.ws || this.ws.readyState !== OPEN) {
      console.error('[SignalingClient] WebSocket is not connected, readyState:', this.ws?.readyState);
      throw new Error('WebSocket is not connected');
    }

    const messageStr = JSON.stringify(message);
    verboseLog('Sending WebSocket message:', messageStr);
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
    const OPEN = 1; // WebSocket.OPEN 상수
    return this.isConnected && this.ws !== null && this.ws.readyState === OPEN;
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


