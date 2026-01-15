# 테스트 환경 구성

**Document Version**: 1.0  
**Software Version**: 0.1.0  
**Last Updated**: 2026-01-14

---

## 테스트 전략

콜라보레이션 기능을 테스트하기 위한 권장 순서:

```
1단계: 같은 NAT 안에서 테스트
  └─ 같은 라우터에 연결된 두 컴퓨터
  └─ STUN만으로 연결 가능 (TURN 불필요)
  └─ 기본 기능 검증

2단계: 다른 네트워크에서 테스트
  └─ 모바일 핫스팟 사용
  └─ TURN 서버 필요할 수 있음
  └─ 실제 사용 환경 시뮬레이션
```

## 1단계: 같은 NAT 안에서 테스트

### 서버 설정

**서버를 모든 네트워크 인터페이스에서 접근 가능하도록 설정:**

```javascript
// 서버 코드 예시
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0'; // localhost 대신 0.0.0.0

app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
  console.log(`Local access: http://localhost:${PORT}`);
  console.log(`Network access: http://[your-ip]:${PORT}`);
});
```

**로컬 IP 주소 확인:**

```bash
# Windows
ipconfig
# IPv4 주소 확인 (예: 192.168.0.100)

# Linux/Mac
ifconfig
# 또는
ip addr show
```

### 클라이언트 환경 변수 설정

**`.env.development` 파일:**

```env
# 서버 컴퓨터의 로컬 IP 주소 사용
VITE_COLLABORATION_SERVER_URL=http://192.168.0.100:3000
VITE_COLLABORATION_WS_URL=ws://192.168.0.100:3000
VITE_API_BASE_URL=http://192.168.0.100:3000/api/online-daw
NODE_ENV=development
VITE_APP_ENV=development
VITE_ENABLE_DEBUG_LOGS=true
VITE_ENABLE_WEBRTC_LOGS=true
VITE_ENABLE_COLLABORATION=true
```

**주의사항:**
- 서버 컴퓨터와 클라이언트 컴퓨터가 같은 네트워크에 있어야 함
- Windows 방화벽에서 포트 3000 허용 필요

### Windows 방화벽 설정

**PowerShell (관리자 권한):**

```powershell
New-NetFirewallRule -DisplayName "Online DAW Server" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
```

**또는 GUI:**
1. Windows 방화벽 → 고급 설정
2. 인바운드 규칙 → 새 규칙
3. 포트 → TCP → 3000
4. 연결 허용

## 2단계: 다른 네트워크에서 테스트

### 방법 1: ngrok 사용 (권장)

**장점:**
- 다른 네트워크에서도 접근 가능
- HTTPS 자동 제공
- 방화벽 설정 불필요
- 간단한 설정

**단점:**
- 무료 버전은 세션당 2시간 제한
- URL이 매번 변경됨 (재시작 시)

**설정 방법:**

```bash
# 1. ngrok 설치
# https://ngrok.com/download

# 2. ngrok 실행
ngrok http 3000

# 출력 예시:
# Forwarding  https://abc123.ngrok.io -> http://localhost:3000
```

**클라이언트 환경 변수:**

```env
# ngrok URL 사용
VITE_COLLABORATION_SERVER_URL=https://abc123.ngrok.io
VITE_COLLABORATION_WS_URL=wss://abc123.ngrok.io
VITE_API_BASE_URL=https://abc123.ngrok.io/api/online-daw
```

**참고:**
- ngrok 무료 버전은 충분히 테스트에 사용 가능
- 프로덕션 환경에서는 실제 도메인과 SSL 인증서 사용 권장

### 방법 2: 로컬 IP 주소 사용 (모바일 핫스팟)

**전제 조건:**
- 모바일 핫스팟과 서버 컴퓨터가 같은 네트워크에 있어야 함
- 모바일 핫스팟을 서버 컴퓨터에서도 연결

**설정:**

```env
# 서버 컴퓨터의 로컬 IP 주소 사용
VITE_COLLABORATION_SERVER_URL=http://192.168.43.100:3000
VITE_COLLABORATION_WS_URL=ws://192.168.43.100:3000
VITE_API_BASE_URL=http://192.168.43.100:3000/api/online-daw
```

**주의사항:**
- 모바일 핫스팟의 IP 대역 확인 필요 (일반적으로 192.168.43.x)
- 서버 컴퓨터도 같은 핫스팟에 연결되어 있어야 함

### 방법 3: 포트 포워딩 (고급)

**라우터 설정:**
- 서버 컴퓨터의 로컬 IP를 DMZ로 설정하거나
- 포트 3000을 서버 컴퓨터로 포워딩

**클라이언트 환경 변수:**

```env
# 라우터의 공인 IP 주소 사용
VITE_COLLABORATION_SERVER_URL=http://[라우터 공인 IP]:3000
VITE_COLLABORATION_WS_URL=ws://[라우터 공인 IP]:3000
VITE_API_BASE_URL=http://[라우터 공인 IP]:3000/api/online-daw
```

**주의사항:**
- 보안 위험 (공인 IP 노출)
- ISP가 포트 차단할 수 있음
- 프로덕션 환경에서는 권장하지 않음

## 테스트 체크리스트

### 1단계: 같은 NAT 테스트

**서버 설정:**
- [ ] 서버가 `0.0.0.0:3000`으로 바인딩됨
- [ ] Windows 방화벽에서 포트 3000 허용됨
- [ ] 서버가 정상적으로 시작됨

**클라이언트 설정:**
- [ ] `.env.development`에 서버 IP 주소 설정됨
- [ ] 클라이언트가 서버에 연결됨
- [ ] WebSocket 연결 성공

**기능 테스트:**
- [ ] 호스트가 "Host" 버튼 클릭 → 룸 코드 생성
- [ ] 호스트가 "Allow Join" 버튼 클릭 → 60초 카운트다운 시작
- [ ] 게스트가 룸 코드로 조인 → 경고 메시지 확인
- [ ] WebRTC P2P 연결 수립됨 (STUN만 사용)
- [ ] 프로젝트 상태 동기화 작동
- [ ] MIDI 이벤트 동기화 작동
- [ ] 채널 볼륨/패닝/이펙트 동기화 작동

### 2단계: 다른 네트워크 테스트

**네트워크 설정:**
- [ ] ngrok 또는 포트 포워딩 설정 완료
- [ ] 서버 접근 가능 (브라우저에서 확인)

**기능 테스트:**
- [ ] 모바일 핫스팟 연결됨
- [ ] 서버 접근 가능
- [ ] WebRTC P2P 연결 수립 (TURN 필요할 수 있음)
- [ ] 모든 동기화 기능 작동
- [ ] 지연시간 확인 (P2P 직접 통신)

## 네트워크 진단 도구

### WebRTC 연결 상태 확인

```javascript
// 브라우저 콘솔에서 실행
const pc = new RTCPeerConnection({
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' }
  ]
});

pc.oniceconnectionstatechange = () => {
  console.log('ICE connection state:', pc.iceConnectionState);
};

pc.onicegatheringstatechange = () => {
  console.log('ICE gathering state:', pc.iceGatheringState);
};

pc.onicecandidate = (event) => {
  if (event.candidate) {
    console.log('ICE candidate:', event.candidate);
  }
};
```

### 서버 연결 테스트

```bash
# 서버가 실행 중인지 확인
curl http://localhost:3000/api/online-daw/rooms

# 네트워크에서 접근 가능한지 확인
curl http://192.168.0.100:3000/api/online-daw/rooms
```

## 문제 해결

### 서버에 연결할 수 없음

1. **서버가 `0.0.0.0`으로 바인딩되었는지 확인**
2. **방화벽 설정 확인** (포트 3000 허용)
3. **네트워크 연결 확인** (ping 테스트)
4. **환경 변수 확인** (서버 IP 주소가 올바른지)

### WebRTC 연결 실패

1. **STUN 서버 확인** (기본적으로 Google STUN 사용)
2. **TURN 서버 필요 여부 확인** (대칭형 NAT인 경우)
3. **브라우저 콘솔에서 에러 확인**
4. **ICE candidate 수집 확인**

### 동기화가 작동하지 않음

1. **P2P 연결 상태 확인** (`iceConnectionState === 'connected'`)
2. **DataChannel 상태 확인** (`readyState === 'open'`)
3. **메시지 전송/수신 로그 확인**
4. **프로젝트 상태 버전 확인**

## 권장 테스트 순서

1. **같은 NAT**: 기본 기능 검증 (STUN만 사용)
2. **ngrok**: 다른 네트워크에서 실제 환경 시뮬레이션
3. **프로덕션**: 실제 서버 배포 후 최종 테스트

**참고:** ngrok이 가장 간단하고 안전한 방법입니다. 무료 버전으로도 충분히 테스트 가능합니다.

---
