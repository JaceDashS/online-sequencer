# Feedback Dialog Scenarios

- Design: [Feedback Dialogs](../../../design/app/98-feedback-dialogs.md)
- Automated transport coverage where applicable: Browser verification of the existing feedback modal.

## Open Write And Close

- Input: The app is open and the visitor selects Feedback.
- Steps: Open the composer, enter text, then close the composer when idle.
- Expected result: The animated composer appears above the current app; no external feedback tab opens. Closing returns to the existing app screen.

## Failed Send And Retry

- Input: A nonempty draft, an authenticated account or guest edit password where supported, and an unavailable or rate limited API.
- Steps: Send once, wait for the error, then explicitly retry.
- Expected result: The draft remains after failure. Sending prevents duplicate submissions and closing during the request; success clears the text and shows confirmation.

## Reduced Motion

- Input: Reduced motion is enabled in the operating system or browser.
- Steps: Open the feedback composer.
- Expected result: The composer opens without movement and remains usable.

## Verification On 2026 11 16

- Production web build passed. Browser checks used mocked session and comments responses; no public comment was posted.
- The composer opened in place, retained the draft after a 429 response, submitted the canonical app identity on explicit retry and closed with Escape.
- Verified at desktop width. The existing application blocks widths below 1120 pixels and does not support mobile.
- Reduced motion is scoped to the feedback stylesheet with a prefers reduced motion media rule.
