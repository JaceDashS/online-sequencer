/**
 * WebRTCManager
 * WebRTC P2P ∞ù░Ω▓░ δ░Å DataChannel Ω┤Çδª¼δÑ╝ δï┤δï╣φò⌐δïêδïñ.
 * φÿ╕∞èñφè╕∞ÖÇ Ω▓î∞èñφè╕ δ¬¿δæÉ∞ùÉ∞ä£ ∞é¼∞Ü⌐δÉ⌐δïêδïñ.
 */

import { getIceServers } from './config/iceServers';
import type { P2PMessage, PeerInfo, ConnectionState } from './types/p2p';

/**
 * WebRTCManager
 * Star φåáφÅ┤δí£∞ºÇ: Ω▓î∞èñφè╕δèö φÿ╕∞èñφè╕δÑ╝ Ω▓╜∞£áφò┤∞ä£ φå╡∞ïá
 */
export class WebRTCManager {
  private isHost: boolean;
  private clientId: string;
  private iceServers: RTCConfiguration;
  
  // φÿ╕∞èñφè╕∞Ü⌐: Ω▓î∞èñφè╕δ│ä ∞ù░Ω▓░ Ω┤Çδª¼
  private guestConnections = new Map<string, PeerInfo>();
  
  // Ω▓î∞èñφè╕∞Ü⌐: φÿ╕∞èñφè╕∞ÖÇ∞¥ÿ ∞ù░Ω▓░
  private hostConnection: PeerInfo | null = null;
  
  // δ⌐ö∞ï£∞ºÇ ∞╜£δ░▒
  private messageCallbacks: Array<(message: P2PMessage) => void> = [];
  private guestMessageCallbacks: Map<string, Array<(message: P2PMessage) => void>> = new Map();
  private connectionStateCallbacks: Map<string, Array<(state: ConnectionState) => void>> = new Map();
  private dataChannelOpenCallbacks: Map<string, Array<() => void>> = new Map();
  private pendingIceCandidates: Map<string, RTCIceCandidateInit[]> = new Map();
  private pendingMessages: Map<string, P2PMessage[]> = new Map();
  
  // ∞ï£Ω╖╕δäÉδºü ∞╜£δ░▒ (offer/answer/ICE candidate ∞áä∞åí∞Ü⌐)
  private signalingCallback?: (message: { type: 'offer' | 'answer' | 'ice-candidate'; from: string; to: string; data: any }) => void;

  constructor(clientId: string, isHost: boolean = false, iceServers?: RTCConfiguration) {
    this.clientId = clientId;
    this.isHost = isHost;
    this.iceServers = iceServers || getIceServers();
    
  }

  /**
   * ∞ï£Ω╖╕δäÉδºü δ⌐ö∞ï£∞ºÇ ∞áä∞åí ∞╜£δ░▒ δô▒δí¥
   * SignalingClientΩ░Ç offer/answer/ICE candidateδÑ╝ ∞áä∞åíφòá ∞êÿ ∞₧êδÅäδí¥ φò¿
   */
  setSignalingCallback(callback: (message: { type: 'offer' | 'answer' | 'ice-candidate'; from: string; to: string; data: any }) => void): void {
    this.signalingCallback = callback;
  }

  /**
   * φÿ╕∞èñφè╕: Ω▓î∞èñφè╕ ∞╢öΩ░Ç (offer ∞êÿ∞ïá ∞ï£)
   */
  async addGuest(guestId: string, offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    if (!this.isHost) {
      throw new Error('Only host can add guests');
    }


    // PeerConnection ∞â¥∞ä▒
    const peerConnection = new RTCPeerConnection(this.iceServers);

    // Peer ∞áòδ│┤ ∞áÇ∞₧Ñ
    const peerInfo: PeerInfo = {
      id: guestId,
      state: 'connecting',
      connection: peerConnection
    };
    this.guestConnections.set(guestId, peerInfo);

    // Ω▓î∞èñφè╕Ω░Ç ∞â¥∞ä▒φò£ DataChannel ∞êÿ∞ïá
    peerConnection.ondatachannel = (event) => {
      const dataChannel = event.channel;
      peerInfo.dataChannel = dataChannel;
      this.setupDataChannel(dataChannel, guestId);
    };

    // ICE candidate ∞êÿ∞ºæ δ░Å ∞áä∞åí
    peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.signalingCallback) {
        this.signalingCallback({
          type: 'ice-candidate',
          from: this.clientId,
          to: guestId,
          data: { candidate: event.candidate.toJSON() }
        });
      } else if (!event.candidate) {
      }
    };

    // ∞ù░Ω▓░ ∞âüφâ£ δ│ÇφÖö Ω░É∞ºÇ
    peerConnection.onconnectionstatechange = () => {
      const state = this.mapConnectionState(peerConnection.connectionState);
      peerInfo.state = state;
      
      // ∞╜£δ░▒ φÿ╕∞╢£
      const callbacks = this.connectionStateCallbacks.get(guestId);
      if (callbacks) {
        callbacks.forEach(cb => cb(state));
      }

      if (state === 'connected') {
      } else if (state === 'failed' || state === 'closed') {
        this.removeGuest(guestId);
      }
    };

    // Offer ∞äñ∞áò δ░Å Answer ∞â¥∞ä▒
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
   * Ω▓î∞èñφè╕: φÿ╕∞èñφè╕∞ÖÇ ∞ù░Ω▓░ (offer ∞â¥∞ä▒)
   */
  async connectToHost(hostId: string): Promise<RTCSessionDescriptionInit> {
    if (this.isHost) {
      throw new Error('Host cannot connect to host');
    }

    if (this.hostConnection) {
      throw new Error('Already connected to host');
    }


    // PeerConnection ∞â¥∞ä▒
    const peerConnection = new RTCPeerConnection(this.iceServers);
    
    // Peer ∞áòδ│┤ ∞áÇ∞₧Ñ
    const peerInfo: PeerInfo = {
      id: hostId,
      state: 'connecting',
      connection: peerConnection
    };
    this.hostConnection = peerInfo;

    // DataChannel ∞â¥∞ä▒ (Ω▓î∞èñφè╕Ω░Ç initiator)
    const dataChannel = peerConnection.createDataChannel('sync', {
      ordered: true, // ∞ê£∞ä£ δ│┤∞₧Ñ
      maxRetransmits: 3
    });
    peerInfo.dataChannel = dataChannel;
    this.setupDataChannel(dataChannel, hostId);

    // ICE candidate ∞êÿ∞ºæ δ░Å ∞áä∞åí
    peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.signalingCallback) {
        this.signalingCallback({
          type: 'ice-candidate',
          from: this.clientId,
          to: hostId,
          data: { candidate: event.candidate.toJSON() }
        });
      } else if (!event.candidate) {
      }
    };

    // ∞ù░Ω▓░ ∞âüφâ£ δ│ÇφÖö Ω░É∞ºÇ
    peerConnection.onconnectionstatechange = () => {
      const state = this.mapConnectionState(peerConnection.connectionState);
      peerInfo.state = state;
      
      // ∞╜£δ░▒ φÿ╕∞╢£
      const callbacks = this.connectionStateCallbacks.get(hostId);
      if (callbacks) {
        callbacks.forEach(cb => cb(state));
      }

      if (state === 'connected') {
      } else if (state === 'failed' || state === 'closed') {
        this.disconnect();
      }
    };

    // Offer ∞â¥∞ä▒
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    await this.waitForIceGatheringComplete(peerConnection);


    return peerConnection.localDescription
      ? { type: peerConnection.localDescription.type, sdp: peerConnection.localDescription.sdp }
      : offer;
  }

  /**
   * Ω▓î∞èñφè╕: φÿ╕∞èñφè╕∞¥ÿ answer ∞êÿ∞ïá δ░Å ∞äñ∞áò
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
   * φÿ╕∞èñφè╕: Ω▓î∞èñφè╕∞¥ÿ offer ∞êÿ∞ïá δ░Å answer ∞â¥∞ä▒ (addGuest∞ÖÇ δÅÖ∞¥╝φòÿ∞ºÇδºî offerδÑ╝ δ¿╝∞áÇ δ░¢δèö Ω▓╜∞Ü░)
   */
  async handleGuestOffer(guestId: string, offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    return this.addGuest(guestId, offer);
  }

  /**
   * ICE candidate ∞╢öΩ░Ç
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
   * φÿ╕∞èñφè╕: Ω▓î∞èñφè╕ ∞á£Ω▒░
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
   * φÿ╕∞èñφè╕: Ω▓î∞èñφè╕∞ùÉΩ▓î δ⌐ö∞ï£∞ºÇ ∞áä∞åí
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
      console.error(`[WebRTCManager] Γ¥î Failed to send message to guest ${guestId}:`, error, {
        messageType: message.type,
        dataChannelState: peerInfo.dataChannel?.readyState
      });
    }
  }

  /**
   * φÿ╕∞èñφè╕: δïñδÑ╕ Ω▓î∞èñφè╕δôñ∞ùÉΩ▓î δ╕îδí£δô£∞║É∞èñφè╕ (δ░£∞ïá∞₧É ∞á£∞Ö╕)
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
   * φÿ╕∞èñφè╕: δ¬¿δôá Ω▓î∞èñφè╕∞ùÉΩ▓î δ╕îδí£δô£∞║É∞èñφè╕
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
   * Ω▓î∞èñφè╕: φÿ╕∞èñφè╕∞ùÉΩ▓î δ⌐ö∞ï£∞ºÇ ∞áä∞åí
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
      console.error(`[WebRTCManager] Γ¥î Failed to send message to host:`, error, {
        messageType: message.type,
        dataChannelState: this.hostConnection.dataChannel?.readyState
      });
    }
  }

  /**
   * Ω▓î∞èñφè╕: φÿ╕∞èñφè╕ δ⌐ö∞ï£∞ºÇ ∞êÿ∞ïá ∞╜£δ░▒ δô▒δí¥
   */
  onMessage(callback: (message: P2PMessage) => void): void {
    this.messageCallbacks.push(callback);
  }

  onMessageFromHost(callback: (message: P2PMessage) => void): void {
    this.onMessage(callback);
  }

  /**
   * φÿ╕∞èñφè╕: Ω▓î∞èñφè╕ δ⌐ö∞ï£∞ºÇ ∞êÿ∞ïá ∞╜£δ░▒ δô▒δí¥
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
   * ∞ù░Ω▓░ ∞âüφâ£ δ│ÇφÖö ∞╜£δ░▒ δô▒δí¥
   */
  onConnectionStateChange(peerId: string, callback: (state: ConnectionState) => void): void {
    if (!this.connectionStateCallbacks.has(peerId)) {
      this.connectionStateCallbacks.set(peerId, []);
    }
    this.connectionStateCallbacks.get(peerId)!.push(callback);
  }

  /**
   * DataChannel ∞ù┤δª╝ ∞╜£δ░▒ δô▒δí¥
   */
  onDataChannelOpen(peerId: string, callback: () => void): void {
    // ∞¥┤δ»╕ ∞ù░Ω▓░δÉ£ Ω▓╜∞Ü░ ∞ªë∞ï£ φÿ╕∞╢£
    const peerInfo = this.isHost 
      ? this.guestConnections.get(peerId)
      : (peerId === this.hostConnection?.id ? this.hostConnection : null);
    
    if (peerInfo?.dataChannel && peerInfo.dataChannel.readyState === 'open') {
      callback();
      return;
    }

    // DataChannel∞¥┤ ∞ù┤δª┤ δòî φÿ╕∞╢£δÉÿδÅäδí¥ ∞╜£δ░▒ ∞áÇ∞₧Ñ
    if (!this.dataChannelOpenCallbacks.has(peerId)) {
      this.dataChannelOpenCallbacks.set(peerId, []);
    }
    this.dataChannelOpenCallbacks.get(peerId)!.push(callback);
  }

  /**
   * δ¬¿δôá ∞ù░Ω▓░ ∞óàδúî
   */
  disconnect(): void {

    if (this.isHost) {
      // δ¬¿δôá Ω▓î∞èñφè╕ ∞ù░Ω▓░ ∞óàδúî
      this.guestConnections.forEach((_peerInfo, guestId) => {
        this.removeGuest(guestId);
      });
    } else {
      // φÿ╕∞èñφè╕ ∞ù░Ω▓░ ∞óàδúî
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

    // ∞╜£δ░▒ ∞┤êΩ╕░φÖö
    this.messageCallbacks = [];
    this.guestMessageCallbacks.clear();
    this.connectionStateCallbacks.clear();
    this.dataChannelOpenCallbacks.clear();
  }

  /**
   * DataChannel ∞äñ∞áò
   */
  private setupDataChannel(dataChannel: RTCDataChannel, peerId: string): void {
    dataChannel.onopen = () => {

      // DataChannel ∞ù┤δª╝ ∞╜£δ░▒ φÿ╕∞╢£
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
      
      // DataChannel∞¥┤ δï½φÿö∞¥ä δòî ∞ù░Ω▓░ ∞âüφâ£δÑ╝ disconnectedδí£ ∞ùàδì░∞¥┤φè╕
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
      console.error(`[WebRTCManager] Γ¥î DataChannel error with ${peerId}:`, error);
    };

    dataChannel.onmessage = (event) => {
      try {
        const message: P2PMessage = JSON.parse(event.data);
        if (message.type === 'transport') {
          const action = (message as any).data?.action;
          const time = (message as any).data?.time;
          console.log('[WebRTCManager] transport-received', {
            peerId,
            from: message.from,
            action,
            time,
            timestamp: message.timestamp,
          });
        }

        if (this.isHost) {
          // φÿ╕∞èñφè╕: Ω▓î∞èñφè╕δí£δ╢Çφä░ δ⌐ö∞ï£∞ºÇ ∞êÿ∞ïá
          const callbacks = this.guestMessageCallbacks.get(peerId);
          if (callbacks) {
            callbacks.forEach(cb => cb(message));
          }
        }
        // Common callbacks fire regardless of role.
        this.messageCallbacks.forEach(cb => cb(message));
      } catch (error) {
        console.error(`[WebRTCManager] Γ¥î Failed to parse message from ${peerId}:`, error, {
          rawData: event.data
        });
      }
    };
  }

  /**
   * RTCPeerConnectionStateδÑ╝ ConnectionStateδí£ δºñφòæ
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
   * ICE gathering ∞ÖäδúîΩ╣î∞ºÇ δîÇΩ╕░ (φâÇ∞₧ä∞òä∞¢â φÅ¼φò¿)
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
   * ∞ù░Ω▓░δÉ£ Ω▓î∞èñφè╕ δ¬⌐δí¥ ∞í░φÜî (φÿ╕∞èñφè╕∞Ü⌐)
   */
  getConnectedGuests(): string[] {
    if (!this.isHost) {
      return [];
    }
    return Array.from(this.guestConnections.entries())
      .filter(([_, peerInfo]) => peerInfo.state === 'connected')
      .map(([guestId]) => guestId);
  }

  /**
   * φÿ╕∞èñφè╕ ∞ù░Ω▓░ ∞âüφâ£ ∞í░φÜî (Ω▓î∞èñφè╕∞Ü⌐)
   */
  getHostConnectionState(): ConnectionState | null {
    if (this.isHost) {
      return null;
    }
    return this.hostConnection?.state || null;
  }

  /**
   * Peer ∞ù░Ω▓░ ∞âüφâ£ ∞í░φÜî
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


