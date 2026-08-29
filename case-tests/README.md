# 통합 테스트 참고 자료

현재 실행 진입점은 터미널 메뉴가 아니라 개발 전용 `/qa` 화면입니다.

## 실행 순서

1. `npm test`로 스크립트 통합 테스트를 실행합니다.
2. `npm run qa`로 개발 서버와 QA 화면을 엽니다.
3. QA 화면에서 Codex 브라우저 시나리오를 큰 시나리오부터 실행합니다.
4. 청취, 실제 장치, 외부 네트워크, Electron처럼 자동 조작할 수 없는 항목만 사용자가 직접 확인합니다.
5. QA 화면의 `결과 JSON 내보내기`로 실행 기록을 보관합니다.

## 판정

- `PASS`: 기대 결과가 모두 확인됨
- `FAIL`: 제품 동작이 기대 결과와 다름. 재현 조건과 실제 결과를 메모에 기록해야 함
- `BLOCKED`: 서버, 장치, 권한 등 외부 조건 때문에 실행할 수 없음. 제품 실패로 집계하지 않음
- `NOT RUN`: 아직 실행하지 않음

협업 서버가 응답하지 않거나 API URL이 설정되지 않으면 서버 의존 시나리오만 자동으로 `BLOCKED` 처리됩니다. 서버와 무관한 편집·UI·파일 시나리오는 계속 실행합니다.

## 기준 환경과 데이터

- Codex 브라우저 기준: Chromium, 1280×720, DPR 1.5
- 사용자 확장 확인: Firefox, 실제 사용 창 크기와 확대율
- 고정 프로젝트: [`fixtures/qa-project.json`](fixtures/qa-project.json)
- 구성: 트랙 3개, 짧은 MIDI 파트 3개, 긴 MIDI 파트 1개, 빈 트랙 1개

## 상세 케이스 자료

아래 JSON과 Markdown의 기존 99개 케이스는 `/qa`의 큰 시나리오와 집중 시나리오로 통합했습니다. 별도 터미널 러너는 더 이상 사용하지 않습니다.

| 기존 영역 | 케이스 수 | 새 QA 시나리오 | 케이스 목록 | 상세 절차 |
|---|---:|---|---|---|
| Tracklist | 13 | `BR-LARGE-01`, `BR-UI-01`, `BR-TRACK-01` | [tracklist.cases.json](tracklist.cases.json) | [tracklist.md](tracklist.md) |
| EventDisplay | 21 | `BR-LARGE-01`, `BR-PART-01`, `BR-EDIT-01` | [eventdisplay.cases.json](eventdisplay.cases.json) | [eventdisplay.md](eventdisplay.md) |
| Shortcuts | 8 | `BR-SHORTCUT-01`, `BR-EDIT-01` | [shortcuts.cases.json](shortcuts.cases.json) | [shortcuts.md](shortcuts.md) |
| Toolbar | 11 | `BR-LARGE-01`, `BR-UI-01`, `BR-RULER-01`, `BR-SHORTCUT-01`, `USER-LARGE-01`, `USER-PERF-01` | [toolbar.cases.json](toolbar.cases.json) | [toolbar.md](toolbar.md) |
| Mixer | 13 | `BR-LARGE-01`, `BR-TRACK-01`, `BR-MIX-01`, `USER-LARGE-01` | [mixer.cases.json](mixer.cases.json) | [mixer.md](mixer.md) |
| Inspector | 6 | `BR-LARGE-01`, `BR-UI-01`, `BR-MIX-01` | [inspector.cases.json](inspector.cases.json) | [inspector.md](inspector.md) |
| Ruler | 9 | `BR-LARGE-01`, `BR-RULER-01` | [ruler.cases.json](ruler.cases.json) | [ruler.md](ruler.md) |
| MidiEditor | 21 | `BR-LARGE-01`, `BR-EDIT-01`, `BR-SUSTAIN-01` | [midieditor.cases.json](midieditor.cases.json) | [midieditor.md](midieditor.md) |
| **합계** | **102** | **20개 큰·집중 시나리오에 통합** |  |  |
