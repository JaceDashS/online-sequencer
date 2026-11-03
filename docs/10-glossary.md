# Glossary

## Project

- Definition: The editable arrangement containing tracks, parts, MIDI notes and timing information.
- Code: Project state, MIDI import and export modules under `src/core/midi/`.
- Related documentation: [Project Save and Load](specs/project-save-load-specification.md).

## Host Token

- Definition: The per-room credential used by a hosting client for room management and re-registration.
- Code: `hostTokenStore`, `SignalingClient`.
- Notes: Distinct from the signed-in account session and its CSRF token.
- Related documentation: [Collaboration Contract](specs/collaboration-specification/server-api.md).

## Commit Tree

- Definition: The Git snapshot containing all tracked file paths, contents and modes for a commit.
- Notes: A commit ID also depends on its parents, message and identity metadata. A changed commit ID alone does not imply changed application code.
- Related documentation: [History Integration](guides/10-history-integration.md).

## Example

- Input: A project shared by a host with a stored room credential.
- Steps: The host re-registers its room through `SignalingClient` using the host token.
- Expected result: The existing room can be reused subject to the server contract without treating the token as an account session.
