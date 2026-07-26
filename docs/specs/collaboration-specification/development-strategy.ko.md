# 개발 전략

**Document Version**: 1.0  
**Software Version**: 0.1.0  
**Last Updated**: 2026-01-14

---

## 현재 구현 경계

이 저장소는 콜라보레이션 클라이언트를 관리한다. 현재 서버 런타임, 라우트 핸들러, 임시 서버 패키지는 포함하지 않는다.

**클라이언트 구현:**
- `src/core/sync/SignalingClient.ts`: HTTP 룸 API와 WebSocket 시그널링
- `src/core/sync/WebRTCManager.ts`: WebRTC PeerConnection과 DataChannel 처리
- `src/core/sync/SyncManager.ts`: 프로젝트 상태와 트랜스포트 동기화
- `src/transport/`: Web과 Electron 트랜스포트 추상화

**서버 경계:**
- 시그널링 서버는 환경 변수로 설정하는 외부 서비스다.
- 이 저장소는 서버 API 계약을 문서화하지만 백엔드 프레임워크를 지정하지 않는다.
- 별도 승인된 작업이 아니라면 이 클라이언트 저장소에 `server/` 또는 `temp-server/`를 추가하지 않는다.

## 서버 연동 접근 방식

콜라보레이션 서버는 [server-api.ko.md](server-api.ko.md)에 정의된 API 계약을 구현하는 별도 백엔드 서비스로 개발하거나 유지한다.

**서버 필수 책임:**
- 설정된 API base URL 아래 REST 룸 엔드포인트 제공
- 같은 API base URL 아래 WebSocket 시그널링 엔드포인트 제공
- 룸 생성 및 조회
- 6시간 룸 만료
- "Allow Join" 60초 조인 허용 창
- 참가자 강퇴 처리
- WebRTC offer, answer, ICE candidate 메시지 전달

**이 저장소 밖에서 결정할 구현 항목:**
- 백엔드 프레임워크
- Redis 또는 데이터베이스 같은 저장소
- 인증/인가 통합
- 배포, 로깅, 모니터링, rate limiting

## 개발 워크플로우

```
1. 서버 API 계약
   ├─ server-api 문서를 SignalingClient와 맞게 유지
   ├─ REST 엔드포인트 경로 확인
   ├─ WebSocket 메시지 형식 확인
   └─ 룸 수명과 조인 허용 동작 확인

2. 클라이언트 기능 개발
   ├─ SignalingClient 유지보수
   ├─ WebRTCManager 유지보수
   ├─ SyncManager 유지보수
   └─ Web과 Electron 트랜스포트 호환성 유지

3. 외부 서버 연동
   ├─ VITE_API_BASE_URL 설정
   ├─ HTTP 룸 API 검증
   ├─ WebSocket 시그널링 검증
   └─ WebRTC 연결 수립 검증

4. 최종 테스트 및 안정화
   ├─ 관련 클라이언트 테스트 실행
   ├─ 설정된 서버와 통합 확인
   ├─ P2P 동기화 동작 검증
   └─ API 동작 변경 시 문서 갱신
```

## 클라이언트 설정

`src/utils/apiConfig.ts`는 콜라보레이션 API URL을 다음 순서로 해석한다.

1. `VITE_API_BASE_URL`
2. `VITE_BASE_URL` + `VITE_API_PATH`

`VITE_API_BASE_URL`에는 콜라보레이션 서버가 사용하는 전체 API base path를 포함한다.

```env
VITE_API_BASE_URL=https://example.com/api/online-sequencer
```

클라이언트는 여기에 `/rooms`, `/rooms/:roomCode`, `/rooms/:roomCode/allow-join`, `/rooms/:roomCode/kick`, `/signaling` 같은 경로를 붙인다.

## 서버 호환성 체크리스트

**API 계약:**
- [ ] `POST /rooms`가 호스트용 룸 코드를 반환함
- [ ] `GET /rooms/:roomCode`가 호스트와 조인 허용 상태를 반환함
- [ ] `POST /rooms/:roomCode/allow-join`이 조인 허용 창을 활성화함
- [ ] `POST /rooms/:roomCode/kick`이 현재 룸 인스턴스에서 참가자를 차단함
- [ ] `DELETE /rooms/:roomCode`가 룸을 종료함

**WebSocket 시그널링:**
- [ ] `/signaling?clientId=...`가 클라이언트 연결을 수락함
- [ ] `register`, `join` 메시지에 `registered`, `joined`로 응답함
- [ ] `signaling` 메시지가 WebRTC offer, answer, ICE candidate 데이터를 전달함
- [ ] 룸 만료, 종료, 참가자 변경 이벤트를 전송함

**클라이언트 연동:**
- [ ] `VITE_API_BASE_URL`이 콜라보레이션 엔드포인트를 포함한 API base를 가리킴
- [ ] HTTP와 WebSocket URL이 같은 API base에서 파생됨
- [ ] Browser와 Electron 트랜스포트가 모두 연결 가능함

**테스트:**
- [ ] 관련 클라이언트 테스트 실행
- [ ] 룸 생성, 조인 허용, 조인, 강퇴, 룸 삭제 테스트
- [ ] 시그널링 이후 WebRTC 연결 수립 테스트
- [ ] DataChannel 기반 프로젝트 상태 동기화 테스트

**문서화:**
- [ ] 서버 계약이 변경되면 [server-api.ko.md](server-api.ko.md) 갱신
- [ ] `src/core/sync` 동작이 변경되면 클라이언트 구현 문서 갱신
- [ ] 한국어/영어 문서 쌍의 구조 유지

## 주의사항

1. **서버 코드는 이 저장소의 범위가 아님**
   - 이 프로젝트는 클라이언트 구현과 API 계약 문서를 관리한다.
   - 서버 구현은 설정된 백엔드 서비스의 책임이다.

2. **API 스펙 일관성 유지**
   - 문서화된 엔드포인트를 `SignalingClient`와 맞게 유지한다.
   - 서버 내부 구현이 바뀌어도 클라이언트 변경은 최소화한다.

3. **설정 호환성**
   - 전체 콜라보레이션 API base에는 `VITE_API_BASE_URL` 사용을 우선한다.
   - base URL을 분리해 조합해야 할 때만 `VITE_BASE_URL`과 `VITE_API_PATH`를 사용한다.

4. **백엔드 스택을 단정하지 않음**
   - 해당 계층의 코드가 추가되지 않는 한 Express, `ws`, Redis, 데이터베이스를 현재 저장소 구현처럼 설명하지 않는다.

---
