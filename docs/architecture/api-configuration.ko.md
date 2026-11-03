# API 설정

**Document Version**: 1.1  
**Software Version**: 0.1.0  
**Last Updated**: 2026-11-03

**카테고리**: 설정 관리 (2026-11-03에 `optimization-design/implementation-level/`에서 이동)

---

## 개요

협업 시그널링 서버의 HTTP API와 WebSocket URL을 환경 변수로 구성하는 방식을 정의합니다. 모든 API 요청 URL은 `buildApiUrl()`, WebSocket URL은 `buildWebSocketUrl()`로 생성합니다.

---

## 설정 우선순위

1. `VITE_API_BASE_URL`이 있으면 이 값을 사용합니다.
2. 없으면 `VITE_BASE_URL` + `VITE_API_PATH` 조합을 사용합니다.
3. 둘 다 없으면 `getApiBaseUrl()`이 에러를 던집니다.

운영 값: `VITE_API_BASE_URL=https://api.jace-s.com/api/online-sequencer` (WebSocket은 `wss://api.jace-s.com/api/online-sequencer/signaling`). 2026-11-03 jace-s API 이전 전의 `https://jace-s.com/api/...`는 전환 기간에만 동작합니다.

### jace-s 공통 주소

| 함수 / 상수 | 환경 변수 | 기본값 | 용도 |
|---|---|---|---|
| `getApiOrigin()` | `VITE_API_ORIGIN` | API 베이스 URL의 origin, 없으면 `https://api.jace-s.com` | `/health`, `/notices`, `/api/auth/*` |
| `getSiteUrl()` | `VITE_SITE_URL` | `https://jace-s.com` | 로그인 화면 `/login` |
| `getLoginHosts()` | `VITE_LOGIN_HOSTS` (쉼표 구분) | `online-sequencer.jace-s.com` | 로그인 UI를 보여줄 호스트 |
| `JACE_S_APP_ID` | - | `41` | `/notices?app=41` |

상세 동작은 [서비스 공지와 로그인 명세](../specs/service-notices-and-login.ko.md)를 참고하십시오.

값은 Vite의 `import.meta.env`에서 먼저 읽고, 없으면 Node `process.env`에서 읽습니다 (스크립트 테스트 실행용).

---

## 구현 위치

- `src/utils/apiConfig.ts`: API 설정 유틸리티

---

## 환경 변수

### VITE_API_BASE_URL (우선)
- 전체 API 베이스 URL을 직접 지정
- 예: `https://api.example.com` 또는 `http://localhost:3000/api`

### VITE_BASE_URL + VITE_API_PATH (대안)
- `VITE_BASE_URL`: 기본 URL (예: `https://example.com`)
- `VITE_API_PATH`: API 경로 (예: `/api` 또는 `api`)
- 조합 결과: `https://example.com/api`

---

## API URL 생성

### getApiBaseUrl()

```typescript
export function getApiBaseUrl(): string {
  // getEnvValue: import.meta.env 우선, 없으면 process.env
  const apiBaseUrl = getEnvValue('VITE_API_BASE_URL');
  const baseUrl = getEnvValue('VITE_BASE_URL');
  const apiPath = getEnvValue('VITE_API_PATH');

  // VITE_API_BASE_URL이 있으면 우선 사용
  if (apiBaseUrl) {
    return apiBaseUrl.replace(/\/$/, '');
  }

  // VITE_BASE_URL과 VITE_API_PATH 조합
  if (!baseUrl || !apiPath) {
    throw new Error(
      'API base URL is not configured. ' +
      'Set VITE_API_BASE_URL or set both VITE_BASE_URL and VITE_API_PATH.'
    );
  }

  const normalizedBase = baseUrl.replace(/\/$/, '');
  const normalizedPath = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
  return `${normalizedBase}${normalizedPath}`.replace(/\/$/, '');
}
```

### buildApiUrl()

```typescript
export function buildApiUrl(endpoint: string): string {
  const baseUrl = getApiBaseUrl();
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${baseUrl}${normalizedEndpoint}`;
}
```

---

## WebSocket URL 생성

### buildWebSocketUrl()

```typescript
export function buildWebSocketUrl(path: string, queryParams?: Record<string, string>): string {
  const apiBaseUrl = getApiBaseUrl();
  
  // HTTP/HTTPS를 WS/WSS로 변환
  const wsBaseUrl = apiBaseUrl
    .replace(/^http:\/\//, 'ws://')
    .replace(/^https:\/\//, 'wss://');
  
  // 경로 정규화
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  
  // 쿼리 파라미터 추가
  let url = `${wsBaseUrl}${normalizedPath}`;
  if (queryParams) {
    const params = new URLSearchParams(queryParams);
    const queryString = params.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }
  
  return url;
}
```

### WebSocket URL 변환 규칙
- HTTP → WS, HTTPS → WSS 자동 변환
- 경로 정규화 (앞뒤 슬래시 처리)
- 쿼리 파라미터 지원

---

## 사용 예시

### 환경 변수 설정

#### 방식 1: VITE_API_BASE_URL 사용
```env
VITE_API_BASE_URL=https://api.example.com
```

#### 방식 2: VITE_BASE_URL + VITE_API_PATH 사용
```env
VITE_BASE_URL=https://example.com
VITE_API_PATH=/api
```

### 코드에서 사용

```typescript
import { buildApiUrl, buildWebSocketUrl } from './utils/apiConfig';

// API 엔드포인트 URL 생성
const roomsUrl = buildApiUrl('/rooms');
const roomUrl = buildApiUrl('/rooms/1234');

// WebSocket URL 생성
const wsUrl = buildWebSocketUrl('/signaling', { clientId: '123' });
```

### 예외: 관리자 비밀번호 확인 API

`src/components/Inspector/PasswordModal.tsx`는 `/api/auth/verify-password`가 협업 API 하위 경로가 아니므로 `getApiOrigin()`을 기준으로 `{apiOrigin}/api/auth/verify-password`를 요청합니다. 관리자 인증 개편 계획은 [관리자 인증 설계](../specs/admin-authentication.ko.md)를 참고하십시오.

---

## 참고사항

### URL 정규화
- API 베이스 URL 끝의 슬래시 제거
- 경로는 항상 `/`로 시작하도록 정규화

### 에러 처리
- 환경 변수가 설정되지 않은 경우 명확한 에러 메시지 제공
- 두 가지 설정 방식 모두 확인 후 에러 발생

---

**Last Updated**: 2026-11-03
