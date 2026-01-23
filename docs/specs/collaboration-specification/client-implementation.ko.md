# 클라이언트 구현

**Document Version**: 1.0  
**Software Version**: 0.1.0  
**Last Updated**: 2026-01-14

---

## 1. SignalingClient

```typescript
class SignalingClient {
  private ws: WebSocket | null = null;
  private roomCode: string | null = null;
  private clientId: string;
  
  constructor(serverUrl: string) {
    this.clientId = generateUUID();
  }
  
  // 룸 등록 (호스트) - 서버에서 룸 코드 생성 (6시간 유지)
  async registerRoom(hostId: string): Promise<string>  // 룸 코드 반환
  
  // 조인 허용 활성화 (호스트) - 언제든지 호출 가능
  // 만료 후에도 다시 호출하면 즉시 조인 허용 상태로 전환
  async allowJoin(roomCode: string, duration: number): Promise<void>
  
  // 참가자 강퇴 (호스트)
  async kickParticipant(roomCode: string, participantId: string): Promise<void>
  
  // 룸 참여 (참가자)
  async joinRoom(roomCode: string): Promise<HostInfo>
  
  // 시그널링 메시지 전송
  sendSignalingMessage(message: SignalingMessage): void
  
  // 시그널링 메시지 수신 콜백 등록
  onSignalingMessage(callback: (message: SignalingMessage) => void): void
  
  // 연결 종료
  disconnect(): void
}
```

**참고:**
- 서버 URL은 `VITE_COLLABORATION_SERVER_URL`에서 읽고, 기본값은 `http://10.0.0.79:3000`.
- WebSocket URL은 `VITE_COLLABORATION_WS_URL`을 사용하며 `/api/online-sequencer/signaling?clientId=...`로 연결함.
- REST API는 `X-Client-Id`를 포함하고, 룸 등록 시에는 `X-Host-Id`를 추가로 사용함.

## 2. WebRTCManager

**호스트 측 (Star 토폴로지):**

```typescript
class HostWebRTCManager {
  private peerConnections = new Map<string, RTCPeerConnection>(); // 게스트별 연결
  private dataChannels = new Map<string, RTCDataChannel>();
  
  constructor(iceServers: RTCConfiguration) {
    // 호스트는 여러 게스트와 연결 관리
  }
  
  // 게스트 추가 (offer 수신 시)
  async addGuest(guestId: string, offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit>
  
  // 게스트 연결 완료 시 콜백
  onGuestConnected(callback: (guestId: string) => void): void
  
  // 게스트에게 메시지 브로드캐스트
  broadcastToOthers(senderId: string, message: P2PMessage): void
  
  // 모든 게스트에게 메시지 브로드캐스트
  broadcastToAll(message: P2PMessage): void
  
  // 특정 게스트에게 메시지 전송
  sendToGuest(guestId: string, message: P2PMessage): void
  
  // 게스트 연결 해제
  removeGuest(guestId: string): void
}
```

**게스트 측:**

```typescript
class GuestWebRTCManager {
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  
  constructor(iceServers: RTCConfiguration) {
    // 게스트는 호스트와만 연결
  }
  
  // 호스트와 연결 (offer 생성)
  async connectToHost(hostId: string): Promise<RTCSessionDescriptionInit>
  
  // 호스트에게 메시지 전송
  sendToHost(message: P2PMessage): void
  
  // 호스트로부터 메시지 수신 콜백
  onMessageFromHost(callback: (message: P2PMessage) => void): void
  
  // 연결 종료
  disconnect(): void
}
```

## 3. SyncManager

**호스트 측:**

```typescript
class HostSyncManager {
  private webRTCManager: HostWebRTCManager;
  private projectState: ProjectState;
  
  constructor(webRTCManager: HostWebRTCManager) {
    this.webRTCManager = webRTCManager;
  }
  
  // 새 게스트가 연결되면 초기 상태 전송
  onGuestConnected(guestId: string): void {
    this.webRTCManager.sendToGuest(guestId, {
      type: 'initial-state',
      data: {
        projectState: this.projectState,
        isInitial: true
      }
    });
  }
  
  // 로컬 변경사항을 모든 게스트에게 브로드캐스트
  broadcastChange(change: RemoteChange): void {
    this.webRTCManager.broadcastToAll({
      type: 'change',
      data: { change }
    });
  }
  
  // 게스트로부터 변경사항 수신 → 다른 게스트들에게 브로드캐스트
  onGuestChange(guestId: string, change: RemoteChange): void {
    // 충돌 해결
    const resolved = this.resolveConflict(change);
    // 프로젝트 상태 업데이트
    this.applyChange(resolved);
    // 다른 게스트들에게 브로드캐스트
    this.webRTCManager.broadcastToOthers(guestId, resolved);
  }
}
```

**게스트 측:**

```typescript
class GuestSyncManager {
  private webRTCManager: GuestWebRTCManager;
  private projectState: ProjectState;
  
  constructor(webRTCManager: GuestWebRTCManager) {
    this.webRTCManager = webRTCManager;
  }
  
  // P2P 연결 수립 후 초기 상태 수신
  onP2PConnected(): void {
    // DataChannel이 열리면 초기 상태 요청
    this.webRTCManager.sendToHost({ type: 'state-request' });
    this.webRTCManager.onMessageFromHost((message) => {
      if (message.type === 'initial-state') {
        this.applyProjectState(message.data.projectState);
      } else if (message.type === 'change') {
        this.onHostChange(message.data.change);
      }
    });
  }
  
  // 호스트로부터 변경사항 수신
  onHostChange(callback: (change: RemoteChange) => void): void {
    this.webRTCManager.onMessageFromHost((message) => {
      if (message.type === 'change') {
        callback(message.data.change);
      }
    });
  }
  
  private applyProjectState(state: ProjectState): void {
    // 호스트의 프로젝트 상태로 완전히 대체
    setProject(state);
    notifyProjectChange({ type: 'project-replaced' });
  }
}
```

---

