# Online DAW

React, TypeScript, Vite로 구축된 웹 기반 디지털 오디오 워크스테이션(DAW)입니다. Online DAW는 실시간 협업 기능을 갖춘 MIDI 편집 기능을 제공합니다.

## 주요 기능

- **MIDI 편집**: 시각적 피아노 롤 인터페이스로 MIDI 노트 생성 및 편집
- **Standard MIDI File (SMF) 지원**: MIDI 1.0 사양을 준수하는 MIDI 파일 가져오기 및 내보내기
- **실시간 협업**: WebRTC P2P 통신을 사용한 협업 기능
- **다중 트랙 지원**: 독립적인 볼륨, 패닝, 이펙트를 가진 여러 트랙 작업
- **오디오 이펙트**: 트랙 및 마스터 채널에 EQ, Delay, Reverb 등의 이펙트 적용
- **프로젝트 관리**: JSON 및 MIDI 형식으로 프로젝트 저장 및 로드

## 기술 스택

- **프론트엔드**: React 19, TypeScript, Vite
- **데스크톱**: Electron (선택사항)
- **오디오**: Web Audio API
- **협업**: WebRTC, WebSocket

## 시작하기

### 사전 요구사항

- Node.js 20.19+ 또는 22.12+
- npm 또는 yarn

### 설치

```bash
npm install
```

### 개발

```bash
# 개발 서버 시작
npm run dev

# Electron으로 실행
npm run electron:dev
```

### 빌드

```bash
# 프로덕션 빌드
npm run build

# Electron 앱 빌드
npm run electron:build
```

## 테스트

```bash
# 유닛 테스트 실행
npm run test:unit

# MIDI 관련 테스트 실행
npm run test:midi-all

# 케이스 테스트 실행
npm run test
```

## 프로젝트 구조

```
online-daw/
├── src/              # 소스 코드
│   ├── components/   # React 컴포넌트
│   ├── core/         # 핵심 로직 (MIDI, 오디오, 동기화)
│   ├── store/        # 상태 관리
│   ├── hooks/        # 커스텀 React 훅
│   └── utils/        # 유틸리티 함수
├── docs/             # 문서
│   ├── specs/        # 기술 명세서
│   └── architecture/ # 아키텍처 문서
├── server/           # 협업용 시그널링 서버
└── public/           # 정적 자산
```

## 문서

자세한 문서는 [docs/README.md](docs/README.md)를 참조하세요:
- MIDI 표준 준수 명세서
- 협업 기능 명세서
- 아키텍처 문서
- 프로젝트 저장/로드 명세서

## 라이선스

자세한 내용은 [LICENSE](LICENSE) 파일을 참조하세요.

