# 보안 고려사항

**Document Version**: 1.0  
**Software Version**: 0.1.0  
**Last Updated**: 2026-01-14

---

## 1. 룸 코드 보안

- 4자리 숫자만으로는 보안이 약함
- 옵션: 더 긴 코드 또는 UUID 사용
- 옵션: 비밀번호 추가

## 2. 호스트 인증

- 호스트 ID 검증
- 세션 토큰 사용

## 3. 데이터 암호화

- WebRTC는 기본적으로 DTLS 암호화 사용
- 추가 암호화 필요시 메시지 레벨 암호화

## 4. 서버 보안

- CORS 설정
- Rate limiting
- DDoS 방어

---
