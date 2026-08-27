# Integration Testing Strategy

This project uses **integration testing** as the umbrella term for checks that validate modules and user flows together. Some internal commands retain names such as `unit`, but the operating priority is the following three-stage sequence.

## Priority

1. **Script integration tests**: `npm test`
2. **Codex browser tests**: the `Codex browser` scenarios in the development-only `/qa` console
3. **Direct user tests**: listening, physical devices, external networks, Electron, and other browsers that Codex cannot judge reliably

Investigate a failure before moving to the next stage. A collaboration scenario blocked by an external server outage does not stop server-independent scenarios.

## Scenario order

Run broad scenarios before focused scenarios for each executor. Use focused scenarios after a broad failure or when an area needs deeper regression coverage.

- Broad: complete editing flow, two-browser collaboration flow, listening-based playback flow
- Focused: panels, track rules, part boundaries, split and merge, ruler, mixer, files, and server recovery

The 99 detailed cases from the eight legacy UI suites are consolidated into 19 broad and focused scenarios. `case-tests/README.md` preserves the mapping from each legacy suite to its new scenarios.

## Running tests

```bash
npm test
npm run qa
```

`npm run qa` starts Vite and opens `/qa`. The QA route is not exposed in production. Download the deterministic project from the console, load it in an app tab, and record each scenario against its expected results.

## Baseline environment

- Codex in-app Chromium viewport: 1280×720
- Measured DPR: 1.5
- User expansion checks: Firefox, real working window sizes, and 80%, 100%, and 125% zoom
- Deterministic fixture: `case-tests/fixtures/qa-project.json`

A different viewport is shown as `DIFFERENT`; it is additional coverage, not a product failure.

## Server outage policy

On startup, the QA console requests the configured API `/rooms` endpoint with a three-second timeout. Any HTTP response means the server is reachable, regardless of status code.

- Missing API URL: mark server-dependent scenarios `BLOCKED`
- Connection failure or timeout: mark server-dependent scenarios `BLOCKED`
- Server responds: clear automatic blocks and restore runnable state
- Server-independent scenarios: continue regardless of server state

`BLOCKED` is not a test failure. Rerun the scenario after the external condition is resolved.

## Results

- `PASS`: every expected result was confirmed
- `FAIL`: product behavior differs from the expectation; actual behavior and reproduction conditions are required in the note
- `BLOCKED`: an external server, device, permission, or environment prevented execution
- `NOT RUN`: not executed yet

Results and notes persist in browser `localStorage`. Use `Export results JSON` in the QA console to share or archive a run, and reset the console before a new regression run.
