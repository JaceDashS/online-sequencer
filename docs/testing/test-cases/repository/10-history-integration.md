# History Integration Scenarios

- Procedure: [History Integration](../../../guides/10-history-integration.md).

## Preserve Source Snapshots

- Input: An integration base and a linear sequence of 21 incoming commits.
- Steps: Recreate commit metadata in sequence, compare each recreated tree with its original, then compare the final source and configuration paths with the incoming tip.
- Expected result: All 21 original trees match exactly. Follow-up documentation changes leave all application source, tests, assets, package files and build configuration unchanged from the incoming tip.
- Validation: Per-commit Git tree ID comparison and final `git diff` restricted to documentation.

## Remove Incoming Attribution

- Input: Incoming author, committer and attribution trailers plus source branch names.
- Steps: Use the configured developer identity, remove attribution trailers, search branch and tag history metadata and tracked text, then list remote refs after integration.
- Expected result: Recreated commits have the configured identity and clean messages. Only the intended development and main branches remain, and release tags remain unchanged.
- Validation: Git log, tracked text searches and `git ls-remote`.

## Preserve Existing History

- Input: Existing development and main tips plus the existing release tag.
- Steps: Check that the development tip is an ancestor of the integrated tip and compare the main and tag IDs before and after the push.
- Expected result: Development advances without replacing its existing ancestry. Main and release tag IDs do not change.

## Reject Concurrent Remote Changes

- Input: Expected source and development branch IDs recorded before integration.
- Steps: Recheck all expected IDs and push the development update and the two exact source branch deletions atomically with explicit leases.
- Expected result: Either all three authorized ref changes succeed together or the server rejects them without partial deletion.

## Validate Imported Application

- Input: The integrated application source and existing dependency installation.
- Steps: Run `npm test` and `npm run build`.
- Expected result: Existing automated integration suites and the TypeScript plus Vite production build pass. Missing environment settings are reported as configuration limitations; script and build success do not establish live service or browser behavior.
- Test: Existing scripts referenced by `package.json`.

## Verification Record

- Date: 2026-11-03.
- Source snapshots: All 21 recreated commit trees match their original trees exactly.
- Application checks: `npm test` and `npm run build` passed.
- Build limitations: The service API, site URL, notice app ID and login host environment settings were absent. The build warns that the related features are disabled. Browser and live service behavior were not validated by these checks.
- Additional build warning: The main JavaScript chunk exceeds the configured size warning threshold.
