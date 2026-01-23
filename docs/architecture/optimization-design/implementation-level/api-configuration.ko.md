# API 설정 변경

**Document Version**: 1.0  
**Software Version**: 0.1.0  
**Last Updated**: 2026-01-23

**카테고리**: 구현 수준 - 설정 관리

---

## 개요

API 베이스 URL 설정 방식을 변경하여 더 유연한 환경 변수 구성을 지원합니다.

---

## 변경 사항

### 이전 방식
- `VITE_API_BASE_URL` 환경 변수만 사용
- 전체 API 베이스 URL을 직접 지정

### 새로운 방식
- `VITE_API_BASE_URL` 우선 사용 (기존 호환성 유지)
- `VITE_BASE_URL` + `VITE_API_PATH` 조합 지원
- WebSocket URL 변환 로직 개선

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
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;
  const baseUrl = import.meta.env.VITE_BASE_URL;
  const apiPath = import.meta.env.VITE_API_PATH;

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

### WebSocket URL 변환 로직 개선
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

---

## 마이그레이션 가이드

### 기존 설정 유지
- `VITE_API_BASE_URL`만 사용하는 경우 변경 불필요

### 새로운 설정으로 전환
- `VITE_BASE_URL`과 `VITE_API_PATH`를 설정하여 더 유연한 구성 가능
- 여러 환경에서 다른 API 경로를 사용하는 경우 유용

---

## 참고사항

### URL 정규화
- 모든 URL에서 끝의 슬래시 제거
- 경로는 항상 `/`로 시작하도록 정규화

### 에러 처리
- 환경 변수가 설정되지 않은 경우 명확한 에러 메시지 제공
- 두 가지 설정 방식 모두 확인 후 에러 발생

---

**작성일**: 2026-01-23  
**버전**: 1.0  
**상태**: 최신

