# 구현 우선순위

**Document Version**: 1.0  
**Software Version**: 0.1.0  
**Last Updated**: 2026-01-14

---

## Phase 1: 기본 연결
1. SignalingClient 구현
2. WebRTCManager 기본 구현 (Star 토폴로지)
3. 서버 API 구현 (포트 3000, `/api/online-daw/rooms`)
4. 룸 생성 (6시간 유지) 및 "Allow Join" 기능 구현 (60초 조인 허용)
5. 호스트 강퇴 기능 구현

## Phase 2: P2P 통신
1. DataChannel 통신 구현 (Star 토폴로지)
2. 호스트-게스트 브로드캐스트 로직
3. 프로젝트 상태 동기화
4. 세션 만료 (6시간 후) 처리 및 P2P 연결 종료 확인

## Phase 3: 고급 기능
1. 충돌 해결 (호스트 중심)
2. 재연결 로직 (세션 만료 후)
3. 성능 최적화

## Phase 4: 안정화
1. 예외 상황 완전 커버
2. 테스트 및 버그 수정
3. 문서화

---
