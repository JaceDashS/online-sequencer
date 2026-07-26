/**
 * WebRTCManager
 * WebRTC P2P 연결과 DataChannel 관리를 담당합니다.
 *
 * 호스트와 게스트 모두에서 사용됩니다.
 */

import { getIceServers } from './config/iceServers';
import type { SignalingMessage } from './SignalingClient';
import type { P2PMessage, PeerInfo, ConnectionState } from './types/p2p';

type OutboundSignalingMessage = Omit<SignalingMessage, 'roomCode' | 'timestamp'>;

/**
 * WebRTCManager
 * Star 토폴로지에서 게스트는 호스트를 경유해 통신합니다.
 */
export class WebRTCManager {
  private isHost: boolean;
  private clientId: string;
  private iceServers: RTCConfiguration;
  
  // ホスト接続
  private guestConnections = new Map<string, PeerInfo>();
  
  // ゲスト接続
  private hostConnection: PeerInfo | null = null;
  
  // コールバック
  private messageCallbacks: Array<(message: P2PMessage) => void> = [];
  private guestMessageCallbacks: Map<string, Array<(message: P2PMessage) => void>> = new Map();
  private connectionStateCallbacks: Map<string, Array<(state: ConnectionState) => void>> = new Map();
  private dataChannelOpenCallbacks: Map<string, Array<() => void>> = new Map();
  private pendingIceCandidates: Map<string, RTCIceCandidateInit[]> = new Map();
  private pendingMessages: Map<string, P2PMessage[]> = new Map();
  
  // シグナリング
  private signalingCallback?: (message: OutboundSignalingMessage) => void;

  constructor(clientId: string, isHost: boolean = false, iceServers?: RTCConfiguration) {
    this.clientId = clientId;
    this.isHost = isHost;
    this.iceServers = iceServers || getIceServers();
    
  }

  /**
   * 시그널링 메시지 전송 콜백을 등록합니다.
   *
   * SignalingClient가 offer, answer, ICE candidate를 전송할 수 있게 합니다.
   */
  setSignalingCallback(callback: (message: OutboundSignalingMessage) => void): void {
    this.signalingCallback = callback;
  }

  /**
   * 호스트가 offer를 보낸 게스트를 추가합니다.
   */
  async addGuest(guestId: string, offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    if (!this.isHost) {
      throw new Error('Only host can add guests');
    }


    // PeerConnection 생성
    const peerConnection = new RTCPeerConnection(this.iceServers);

    // Peer 정보 저장
    const peerInfo: PeerInfo = {
      id: guestId,
      state: 'connecting',
      connection: peerConnection
    };
    this.guestConnections.set(guestId, peerInfo);

    // 게스트가 생성한 DataChannel을 수신합니다.
    peerConnection.ondatachannel = (event) => {
      const dataChannel = event.channel;
      peerInfo.dataChannel = dataChannel;
      this.setupDataChannel(dataChannel, guestId);
    };

    // ICE candidate를 수집하고 전송합니다.
    peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.signalingCallback) {
        this.signalingCallback({
          type: 'ice-candidate',
          from: this.clientId,
          to: guestId,
          data: { candidate: event.candidate.toJSON() }
        });
      }
    };

    // 연결 상태 변화를 감지합니다.
    peerConnection.onconnectionstatechange = () => {
      const state = this.mapConnectionState(peerConnection.connectionState);
      peerInfo.state = state;
      
      // コールバック実行
      const callbacks = this.connectionStateCallbacks.get(guestId);
      if (callbacks) {
        callbacks.forEach(cb => cb(state));
      }

      if (state === 'failed' || state === 'closed') {
        this.removeGuest(guestId);
      }
    };

    // Offer를 설정하고 answer를 생성합니다.
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    await this.flushQueuedIceCandidates(guestId, peerConnection);
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    await this.waitForIceGatheringComplete(peerConnection);


    return peerConnection.localDescription
      ? { type: peerConnection.localDescription.type, sdp: peerConnection.localDescription.sdp }
      : answer;
  }

  /**
   * 게스트가 호스트와 연결하기 위한 offer를 생성합니다.
   */
  async connectToHost(hostId: string): Promise<RTCSessionDescriptionInit> {
    if (this.isHost) {
      throw new Error('Host cannot connect to host');
    }

    if (this.hostConnection) {
      throw new Error('Already connected to host');
    }


    // PeerConnection 생성
    const peerConnection = new RTCPeerConnection(this.iceServers);
    
    // Peer 정보 저장
    const peerInfo: PeerInfo = {
      id: hostId,
      state: 'connecting',
      connection: peerConnection
    };
    this.hostConnection = peerInfo;

    // 게스트가 initiator로 DataChannel을 생성합니다.
    const dataChannel = peerConnection.createDataChannel('sync', {
      ordered: true, // 순서 보장
      maxRetransmits: 3
    });
    peerInfo.dataChannel = dataChannel;
    this.setupDataChannel(dataChannel, hostId);

    // ICE candidate를 수집하고 전송합니다.
    peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.signalingCallback) {
        this.signalingCallback({
          type: 'ice-candidate',
          from: this.clientId,
          to: hostId,
          data: { candidate: event.candidate.toJSON() }
        });
      }
    };

    // 연결 상태 변화를 감지합니다.
    peerConnection.onconnectionstatechange = () => {
      const state = this.mapConnectionState(peerConnection.connectionState);
      peerInfo.state = state;
      
      // コールバック実行
      const callbacks = this.connectionStateCallbacks.get(hostId);
      if (callbacks) {
        callbacks.forEach(cb => cb(state));
      }

      if (state === 'failed' || state === 'closed') {
        this.disconnect();
      }
    };

    // Offer 생성
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    await this.waitForIceGatheringComplete(peerConnection);


    return peerConnection.localDescription
      ? { type: peerConnection.localDescription.type, sdp: peerConnection.localDescription.sdp }
      : offer;
  }

  /**
   * 게스트가 호스트의 answer를 수신해 설정합니다.
   */
  async setHostAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    if (this.isHost) {
      throw new Error('Host cannot set host answer');
    }

    if (!this.hostConnection?.connection) {
      throw new Error('Not connected to host');
    }

    await this.hostConnection.connection.setRemoteDescription(new RTCSessionDescription(answer));
    await this.flushQueuedIceCandidates(this.hostConnection.id, this.hostConnection.connection);
  }

  /**
   * 호스트가 게스트의 offer를 받고 answer를 생성합니다.
   */
  async handleGuestOffer(guestId: string, offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    return this.addGuest(guestId, offer);
  }

  /**
   * ICE candidate를 추가합니다.
   */
  async addIceCandidate(peerId: string, candidate: RTCIceCandidateInit): Promise<void> {
    const peerInfo = this.isHost 
      ? this.guestConnections.get(peerId)
      : (peerId === this.hostConnection?.id ? this.hostConnection : null);

    if (!peerInfo?.connection) {
      this.queueIceCandidate(peerId, candidate);
      return;
    }

    if (!peerInfo.connection.remoteDescription) {
      this.queueIceCandidate(peerId, candidate);
      return;
    }

    try {
      await peerInfo.connection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error(`[WebRTCManager] Failed to add ICE candidate for peer ${peerId}:`, error);
    }
  }

  private queueIceCandidate(peerId: string, candidate: RTCIceCandidateInit): void {
    const pending = this.pendingIceCandidates.get(peerId) ?? [];
    pending.push(candidate);
    this.pendingIceCandidates.set(peerId, pending);
  }

  private async flushQueuedIceCandidates(peerId: string, connection: RTCPeerConnection): Promise<void> {
    const pending = this.pendingIceCandidates.get(peerId);
    if (!pending?.length) {
      return;
    }

    this.pendingIceCandidates.delete(peerId);
    for (const candidate of pending) {
      try {
        await connection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error(`[WebRTCManager] Failed to add ICE candidate for peer ${peerId}:`, error);
      }
    }
  }

  /**
   * 호스트가 게스트 연결을 제거합니다.
   */
  removeGuest(guestId: string): void {
    if (!this.isHost) {
      throw new Error('Only host can remove guests');
    }

    const peerInfo = this.guestConnections.get(guestId);
    if (peerInfo) {
      if (peerInfo.dataChannel) {
        peerInfo.dataChannel.close();
      }
      if (peerInfo.connection) {
        peerInfo.connection.close();
      }
      this.guestConnections.delete(guestId);
      this.guestMessageCallbacks.delete(guestId);
      this.connectionStateCallbacks.delete(guestId);
    }
  }

  /**
   * 호스트가 특정 게스트에게 메시지를 전송합니다.
   */
  sendToGuest(guestId: string, message: P2PMessage): void {
    if (!this.isHost) {
      throw new Error('Only host can send to guests');
    }

    const peerInfo = this.guestConnections.get(guestId);
    if (!peerInfo?.dataChannel || peerInfo.dataChannel.readyState !== 'open') {
      this.queueMessage(guestId, message);
      return;
    }

    try {
      const messageStr = JSON.stringify(message);
      peerInfo.dataChannel.send(messageStr);
    } catch (error) {
      console.error(`[WebRTCManager] Failed to send message to guest ${guestId}:`, error, {
        messageType: message.type,
        dataChannelState: peerInfo.dataChannel?.readyState
      });
    }
  }

  /**
   * 호스트가 보낸 사람을 제외한 다른 게스트에게 메시지를 브로드캐스트합니다.
   */
  broadcastToOthers(senderId: string, message: P2PMessage): void {
    if (!this.isHost) {
      throw new Error('Only host can broadcast to others');
    }

    this.guestConnections.forEach((_peerInfo, guestId) => {
      if (guestId !== senderId) {
        this.sendToGuest(guestId, message);
      }
    });
  }

  /**
   * 호스트가 모든 게스트에게 메시지를 브로드캐스트합니다.
   */
  broadcastToAll(message: P2PMessage): void {
    if (!this.isHost) {
      throw new Error('Only host can broadcast to all');
    }

    this.guestConnections.forEach((_peerInfo, guestId) => {
      this.sendToGuest(guestId, message);
    });
  }

  /**
   * 게스트가 호스트에게 메시지를 전송합니다.
   */
  sendToHost(message: P2PMessage): void {
    if (this.isHost) {
      throw new Error('Host cannot send to host');
    }

    if (!this.hostConnection?.dataChannel || this.hostConnection.dataChannel.readyState !== 'open') {
      this.queueMessage(this.hostConnection?.id ?? 'host', message);
      return;
    }

    try {
      const messageStr = JSON.stringify(message);
      this.hostConnection.dataChannel.send(messageStr);
    } catch (error) {
      console.error(`[WebRTCManager] Failed to send message to host:`, error, {
        messageType: message.type,
        dataChannelState: this.hostConnection.dataChannel?.readyState
      });
    }
  }

  /**
   * 게스트가 호스트 메시지 수신 콜백을 등록합니다.
   */
  onMessage(callback: (message: P2PMessage) => void): void {
    this.messageCallbacks.push(callback);
  }

  onMessageFromHost(callback: (message: P2PMessage) => void): void {
    this.onMessage(callback);
  }

  /**
   * 호스트가 게스트 메시지 수신 콜백을 등록합니다.
   */
  onMessageFromGuest(guestId: string, callback: (message: P2PMessage) => void): void {
    if (!this.isHost) {
      throw new Error('Only host can register guest message callback');
    }
    if (!this.guestMessageCallbacks.has(guestId)) {
      this.guestMessageCallbacks.set(guestId, []);
    }
    this.guestMessageCallbacks.get(guestId)!.push(callback);
  }

  /**
   * 연결 상태 변경 콜백을 등록합니다.
   */
  onConnectionStateChange(peerId: string, callback: (state: ConnectionState) => void): void {
    if (!this.connectionStateCallbacks.has(peerId)) {
      this.connectionStateCallbacks.set(peerId, []);
    }
    this.connectionStateCallbacks.get(peerId)!.push(callback);
  }

  /**
   * DataChannel open 콜백을 등록합니다.
   */
  onDataChannelOpen(peerId: string, callback: () => void): void {
    // 이미 연결되어 있으면 즉시 호출합니다.
    const peerInfo = this.isHost 
      ? this.guestConnections.get(peerId)
      : (peerId === this.hostConnection?.id ? this.hostConnection : null);
    
    if (peerInfo?.dataChannel && peerInfo.dataChannel.readyState === 'open') {
      callback();
      return;
    }

    // DataChannel이 열린 뒤 호출되도록 콜백을 저장합니다.
    if (!this.dataChannelOpenCallbacks.has(peerId)) {
      this.dataChannelOpenCallbacks.set(peerId, []);
    }
    this.dataChannelOpenCallbacks.get(peerId)!.push(callback);
  }

  /**
   * 모든 WebRTC 연결을 종료합니다.
   */
  disconnect(): void {

    if (this.isHost) {
      // 모든 게스트 연결 종료
      this.guestConnections.forEach((_peerInfo, guestId) => {
        this.removeGuest(guestId);
      });
    } else {
      // 호스트 연결 종료
      if (this.hostConnection) {
        if (this.hostConnection.dataChannel) {
          this.hostConnection.dataChannel.close();
        }
        if (this.hostConnection.connection) {
          this.hostConnection.connection.close();
        }
        this.hostConnection = null;
      }
    }

    // コールバック初期化
    this.messageCallbacks = [];
    this.guestMessageCallbacks.clear();
    this.connectionStateCallbacks.clear();
    this.dataChannelOpenCallbacks.clear();
  }

  /**
   * DataChannel을 설정합니다.
   */
  private setupDataChannel(dataChannel: RTCDataChannel, peerId: string): void {
    dataChannel.onopen = () => {

      // DataChannel open 콜백 호출
      const callbacks = this.dataChannelOpenCallbacks.get(peerId);
      if (callbacks) {
        callbacks.forEach(cb => {
          try {
            cb();
          } catch (error) {
            console.error(`[WebRTCManager] Error in dataChannelOpen callback for ${peerId}:`, error);
          }
        });
      }

      this.flushPendingMessages(peerId, dataChannel);
    };

    dataChannel.onclose = () => {
      
      // DataChannel이 닫히면 연결 상태를 disconnected로 갱신합니다.
      const peerInfo = this.isHost 
        ? this.guestConnections.get(peerId)
        : (peerId === this.hostConnection?.id ? this.hostConnection : null);
      
      if (peerInfo && peerInfo.state !== 'closed') {
        peerInfo.state = 'disconnected';
        const callbacks = this.connectionStateCallbacks.get(peerId);
        if (callbacks) {
          callbacks.forEach(cb => cb('disconnected'));
        }
      }
    };

    dataChannel.onerror = (error) => {
      console.error(`[WebRTCManager] DataChannel error with ${peerId}:`, error);
    };

    dataChannel.onmessage = (event) => {
      try {
        const message: P2PMessage = JSON.parse(event.data);

        if (this.isHost) {
          // 호스트는 게스트별 메시지 콜백을 호출합니다.
          const callbacks = this.guestMessageCallbacks.get(peerId);
          if (callbacks) {
            callbacks.forEach(cb => cb(message));
          }
        }
        // Common callbacks fire regardless of role.
        this.messageCallbacks.forEach(cb => cb(message));
      } catch (error) {
        console.error(`[WebRTCManager] Failed to parse message from ${peerId}:`, error, {
          rawData: event.data
        });
      }
    };
  }

  /**
   * RTCPeerConnectionState를 내부 ConnectionState로 변환합니다.
   */
  private mapConnectionState(state: RTCPeerConnectionState): ConnectionState {
    switch (state) {
      case 'new':
        return 'new';
      case 'connecting':
        return 'connecting';
      case 'connected':
        return 'connected';
      case 'disconnected':
        return 'disconnected';
      case 'failed':
        return 'failed';
      case 'closed':
        return 'closed';
      default:
        return 'new';
    }
  }

  private queueMessage(peerId: string, message: P2PMessage): void {
    const pending = this.pendingMessages.get(peerId) ?? [];
    pending.push(message);
    this.pendingMessages.set(peerId, pending);
  }

  private flushPendingMessages(peerId: string, dataChannel: RTCDataChannel): void {
    const pending = this.pendingMessages.get(peerId);
    if (!pending?.length || dataChannel.readyState !== 'open') {
      return;
    }

    this.pendingMessages.delete(peerId);
    pending.forEach((message) => {
      try {
        dataChannel.send(JSON.stringify(message));
      } catch (error) {
        console.error(`[WebRTCManager] Failed to send queued message to ${peerId}:`, error);
      }
    });
  }
  /**
   * ICE gathering이 완료될 때까지 기다립니다. 타임아웃을 포함합니다.
   */
  private async waitForIceGatheringComplete(peerConnection: RTCPeerConnection): Promise<void> {
    if (peerConnection.iceGatheringState === 'complete') {
      return;
    }

    await new Promise<void>((resolve) => {
      const timeout = globalThis.setTimeout(() => {
        peerConnection.removeEventListener('icegatheringstatechange', onStateChange);
        resolve();
      }, 2000);

      const onStateChange = () => {
        if (peerConnection.iceGatheringState === 'complete') {
          globalThis.clearTimeout(timeout);
          peerConnection.removeEventListener('icegatheringstatechange', onStateChange);
          resolve();
        }
      };

      peerConnection.addEventListener('icegatheringstatechange', onStateChange);
    });
  }

  /**
   * 호스트가 연결된 게스트 목록을 조회합니다.
   */
  getConnectedGuests(): string[] {
    if (!this.isHost) {
      return [];
    }
    return Array.from(this.guestConnections.entries())
      .filter(([, peerInfo]) => peerInfo.state === 'connected')
      .map(([guestId]) => guestId);
  }

  /**
   * 게스트가 호스트 연결 상태를 조회합니다.
   */
  getHostConnectionState(): ConnectionState | null {
    if (this.isHost) {
      return null;
    }
    return this.hostConnection?.state || null;
  }

  /**
   * 특정 peer의 연결 상태를 조회합니다.
   */
  getPeerConnectionState(peerId: string): ConnectionState | null {
    if (this.isHost) {
      const peerInfo = this.guestConnections.get(peerId);
      return peerInfo?.state || null;
    } else {
      if (peerId === this.hostConnection?.id) {
        return this.hostConnection.state || null;
      }
      return null;
    }
  }
}
