# Navigation Design

- Input: Application entry and navigation actions.
- Output: Product views without creator About navigation.
- Code: src/components/Floating/.
- Implementation: The unused About placeholder component and its empty stylesheet are removed. About Developer opens https://jace-s.com/about in a separate tab; the removed internal About placeholder is not used.
- Spec: [Navigation](../../specs/app/10-navigation.md).
- Architecture: [Overview](../playback/15-playback-architecture.md).
- Scenarios: [Navigation](../../testing/test-cases/app/10-navigation.md).

## Example
- Input: Online Sequencer.
- Steps: Open the sequencer and inspect its navigation.
- Expected result: No About entry is shown and no import references the removed placeholder.
