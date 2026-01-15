# 프로토콜 정의

**Document Version**: 1.0  
**Software Version**: 0.1.0  
**Last Updated**: 2026-01-14

---

## 시그널링 메시지 타입

### 1. 룸 등록 (호스트 → 서버)

```typescript
interface RegisterRoomRequest {
  hostId: string;          // 호스트 고유 ID (UUID)
  metadata?: {
    hostName?: string;
    maxParticipants?: number;  // 기본값: 4
  };
}

interface RegisterRoomResponse {
  success: boolean;
  roomCode: string;        // 서버가 생성한 4자리 숫자 (0000-9999)
  hostId: string;
  expiresAt: number;       // 룸 만료 시간 (밀리초, 6시간 후)
  allowJoin: boolean;      // 조인 허용 여부 (초기값: false)
}
```

**참고:** 룸 코드는 서버에서 생성하여 반환합니다. 클라이언트는 룸 코드를 생성하지 않습니다.

### 2. 룸 조회 (참가자 → 서버)

```typescript
interface GetRoomRequest {
  roomCode: string;
}

interface GetRoomResponse {
  success: boolean;
  room?: {
    roomCode: string;
    hostId: string;
    status: 'active' | 'inactive' | 'full';
    allowJoin: boolean;           // 조인 허용 여부
    allowJoinExpiresAt?: number;  // 조인 허용 만료 시간
    participantCount: number;
    maxParticipants: number;
    createdAt: number;
    expiresAt: number;            // 룸 만료 시간 (6시간 후)
  };
  error?: string;
}
```

### 3. WebRTC 시그널링 메시지

```typescript
interface SignalingMessage {
  type: 'offer' | 'answer' | 'ice-candidate';
  from: string;            // 발신자 ID
  to: string;              // 수신자 ID (호스트 또는 참가자)
  roomCode: string;
  data: {
    // WebRTC offer/answer
    sdp?: RTCSessionDescriptionInit;
    // ICE candidate
    candidate?: RTCIceCandidateInit;
  };
  timestamp: number;
}
```

### 4. P2P 데이터 메시지 (WebRTC DataChannel)

```typescript
interface P2PMessage {
  type: 'initial-state' | 'state-request' | 'change' | 'transport' | 'ping' | 'pong' | 'error';
  from: string;
  to?: string;
  timestamp: number;
  data?: any;
}

// 초기 상태 (호스트 → 게스트)
interface InitialStateMessage extends P2PMessage {
  type: 'initial-state';
  data: {
    projectState: ProjectState; // 프로젝트 전체 상태
    isInitial: boolean;
  };
}

// 초기 상태 요청 (게스트 → 호스트)
interface StateRequestMessage extends P2PMessage {
  type: 'state-request';
}

// 변경사항 전파
interface ChangeMessage extends P2PMessage {
  type: 'change';
  data: {
    change: RemoteChange;
    sequence?: number;
  };
}

interface RemoteChange {
  type:
    | 'channel-volume'
    | 'channel-pan'
    | 'channel-effect'
    | 'master-volume'
    | 'master-pan'
    | 'master-effect'
    | 'midi-part'
    | 'midi-note'
    | 'time-signature'
    | 'bpm';
  trackId?: string;
  partId?: string;
  noteId?: string;
  value: any;
  timestamp: number;
  clientId: string;
}

// 재생 동기화
interface TransportMessage extends P2PMessage {
  type: 'transport';
  data: {
    action: 'play' | 'pause' | 'stop' | 'seek';
    time: number; // seconds
  };
}
```

**참고:**
- 게스트는 DataChannel이 열리면 `state-request`를 보내고, 호스트가 `initial-state`로 응답합니다.
- 타이밍 동기화는 tempo/time signature 맵 전체가 아니라 tick 0의 첫 이벤트만 반영됩니다.
- 마스터 동기화는 pan/effect만 적용되며, master volume은 정의되어 있으나 전송되지 않습니다.

---
