# 콜라보레이션 기능 명세서

**Document Version**: 2.0  
**Software Version**: 0.1.0  
**Last Updated**: 2026-11-03  
**시그널링 API**: `https://api.jace-s.com/online-sequencer` (`VITE_API_URL` 기준, [API 설정](../../architecture/api-configuration.md))

---

## 이 폴더의 성격

- **서버 계약 원문**은 jace-s 저장소(`JaceDashS/jace-s-platform`)의 `docs/api/apps/online-sequencer/`(`10-client-contract.md`, `20-health.md`, `30-app-contract.md`)에 있습니다. 서버 구현은 그 원문을 기준으로 합니다.
- 이 폴더는 **클라이언트 기준 요약과 설계 문서**입니다. 원문과 다르면 원문이 우선하며, 이 폴더를 고칩니다.
- 마지막 원문 대조: jace-s 커밋 `9416e01` (2026-11-03)

| 문서 | 성격 |
|---|---|
| 서버 API, 프로토콜, 연결 플로우, 클라이언트 구현, 보안 | 현재 계약·코드 기준 (2026-11-03 대조) |
| 예외 상황 및 핸들링 | 설계 시나리오 + 구현 현황표 (예시 코드는 실제 구현 아님) |
| 개요, 아키텍처, 개발 전략, 구현 우선순위, 테스트, 서버 리소스, Star 토폴로지, 참고 자료 | 초기 설계 문서 (방 유지 시간 등 일부 표현만 갱신) |

## 목차

1. [개요](overview.md)
2. [아키텍처](architecture.md)
3. [연결 플로우](connection-flow.md)
4. [프로토콜 정의](protocol.md)
5. [서버 API 스펙](server-api.md)
6. [클라이언트 구현](client-implementation.md)
7. [예외 상황 및 핸들링](error-handling.md)
8. [보안 고려사항](security.md)
9. [개발 전략](development-strategy.md)
10. [구현 우선순위](implementation-priority.md)
11. [테스트 환경 구성](test-environment.md)
12. [테스트 시나리오](test-scenarios.md)
13. [서버 리소스 관리 상세](server-resources.md)
14. [Star 토폴로지 상세](star-topology.md)
15. [참고 자료](references.md)
