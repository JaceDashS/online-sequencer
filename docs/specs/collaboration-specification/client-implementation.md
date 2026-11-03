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
  
  // 룸 등록 (호스트) - 서버에서 룸 코드 생성 (로그인 6시간·비로그인 1시간 유지)
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
- API URL은 `src/utils/apiConfig.ts`를 통해 해석한다.
- API 주소는 `VITE_API_URL`(코드 기본값 없음, 운영 `https://api.jace-s.com`) 하나로 설정하고, 협업 경로 `/online-sequencer`는 코드가 붙인다. 예전 `VITE_API_BASE_URL`, `VITE_BASE_URL`, `VITE_API_PATH`는 사용하지 않는다.
- WebSocket URL은 같은 API base에서 `http`/`https`를 `ws`/`wss`로 바꾸고 `/signaling?clientId=...`를 붙여 생성한다.
- 방 조회는 선택 헤더 `x-client-id`를 보낸다. 호스트 전용 요청(재등록·삭제·조인 허용·강퇴)과 WebSocket `register`는 방 생성 때 받은 `hostToken`을 쓴다(REST는 `Authorization: Bearer`, WebSocket은 `data.hostToken`). 토큰은 같은 탭의 `sessionStorage`에도 보관하며 자동 복구는 하지 않는다. 로그인 상태의 변경 요청에는 `x-csrf-token`을 붙인다.

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
  
  // 피어 메시지 수신 콜백
  onMessage(callback: (message: P2PMessage) => void): void
  
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
    this.webRTCManager.onMessage((message) => {
      if (message.type === 'initial-state') {
        this.applyProjectState(message.data.projectState);
      } else if (message.type === 'change') {
        this.onHostChange(message.data.change);
      }
    });
  }
  
  // 호스트로부터 변경사항 수신
  onHostChange(callback: (change: RemoteChange) => void): void {
    this.webRTCManager.onMessage((message) => {
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
