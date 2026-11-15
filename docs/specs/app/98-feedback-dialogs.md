# Feedback Dialog Requirements

Feedback writing opens inside Online Sequencer, preserving the current app screen and the existing About Developer link. Opening uses an animation unless reduced motion is enabled. Public posting and app attribution use the existing comments API. Member credentials are reused; products that permit guests require their edit password. Failed sends retain text and successful sends clear it. A pending send cannot be duplicated or dismissed.

- Design: [Feedback Dialogs](../../design/app/98-feedback-dialogs.md)

## Example

- Input: An app visitor selects Feedback and enters text.
- Steps: Open the composer, submit once and close after success.
- Expected result: A public comment is posted with the product identity and the underlying app remains open.
