# 통합 테스트 참고 자료
**Document Version**: 1.0  
**Software Version**: 0.1.0  
**Last Updated**: 2026-11-03
---
현재 실행 진입점은 터미널 메뉴가 아니라 개발 전용 `/qa` 화면입니다.
실행 순서, 판정(`PASS`·`FAIL`·`BLOCKED`·`NOT RUN`), 서버 장애 정책은 [통합 테스트 전략](../../10-strategy.md)을 따릅니다. 이 문서는 고정 데이터와 상세 케이스 대응표만 다룹니다.
## 기준 환경과 데이터
- Codex 브라우저 기준: Chromium, 1280×720, DPR 1.5
- 사용자 확장 확인: Firefox, 실제 사용 창 크기와 확대율
- 고정 프로젝트: [`fixtures/qa-project.json`](../../../../case-tests/fixtures/qa-project.json)
- 구성: 트랙 3개, 짧은 MIDI 파트 3개, 긴 MIDI 파트 1개, 빈 트랙 1개
## 상세 케이스 자료
아래 JSON과 Markdown의 기존 102개 케이스는 `/qa`의 큰 시나리오와 집중 시나리오로 통합했습니다. 별도 터미널 러너는 더 이상 사용하지 않습니다.
| 기존 영역 | 케이스 수 | 새 QA 시나리오 | 케이스 목록 | 상세 절차 |
|---|---:|---|---|---|
| Tracklist | 13 | `BR-LARGE-01`, `BR-UI-01`, `BR-TRACK-01` | [tracklist.cases.json](../../../../case-tests/tracklist.cases.json) | [tracklist.md](90-tracklist.md) |
| EventDisplay | 21 | `BR-LARGE-01`, `BR-PART-01`, `BR-EDIT-01` | [eventdisplay.cases.json](../../../../case-tests/eventdisplay.cases.json) | [eventdisplay.md](10-eventdisplay.md) |
| Shortcuts | 8 | `BR-SHORTCUT-01`, `BR-EDIT-01` | [shortcuts.cases.json](../../../../case-tests/shortcuts.cases.json) | [shortcuts.md](70-shortcuts.md) |
| Toolbar | 11 | `BR-LARGE-01`, `BR-UI-01`, `BR-RULER-01`, `BR-SHORTCUT-01`, `USER-LARGE-01`, `USER-PERF-01` | [toolbar.cases.json](../../../../case-tests/toolbar.cases.json) | [toolbar.md](80-toolbar.md) |
| Mixer | 13 | `BR-LARGE-01`, `BR-TRACK-01`, `BR-MIX-01`, `USER-LARGE-01` | [mixer.cases.json](../../../../case-tests/mixer.cases.json) | [mixer.md](40-mixer.md) |
| Inspector | 6 | `BR-LARGE-01`, `BR-UI-01`, `BR-MIX-01` | [inspector.cases.json](../../../../case-tests/inspector.cases.json) | [inspector.md](20-inspector.md) |
| Ruler | 9 | `BR-LARGE-01`, `BR-RULER-01` | [ruler.cases.json](../../../../case-tests/ruler.cases.json) | [ruler.md](60-ruler.md) |
| MidiEditor | 21 | `BR-LARGE-01`, `BR-EDIT-01`, `BR-SUSTAIN-01` | [midieditor.cases.json](../../../../case-tests/midieditor.cases.json) | [midieditor.md](30-midieditor.md) |
| **합계** | **102** | **20개 큰·집중 시나리오에 통합** |  |  |

- [Eventdisplay](10-eventdisplay.md) — Reference for this topic
- [Inspector](20-inspector.md) — Reference for this topic
- [Midieditor](30-midieditor.md) — Reference for this topic
- [Mixer](40-mixer.md) — Reference for this topic
- [Ruler](60-ruler.md) — Reference for this topic
- [Shortcuts](70-shortcuts.md) — Reference for this topic
- [Toolbar](80-toolbar.md) — Reference for this topic
- [Tracklist](90-tracklist.md) — Reference for this topic
