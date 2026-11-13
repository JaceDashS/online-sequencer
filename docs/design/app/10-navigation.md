# Navigation Design

- Input: Application entry and navigation actions.
- Output: Product views without creator About navigation.
- Code: src/components/Floating/.
- Implementation: The unused About placeholder component and its empty stylesheet are removed. No About menu is introduced; sequencing and feedback are unchanged.
- Spec: [Navigation](../../specs/app/10-navigation.md).
- Architecture: [Overview](../../architecture/README.md).
- Scenarios: [Navigation](../../testing/scenarios/app/10-navigation.md).

## Example
- Input: Online Sequencer.
- Steps: Open the sequencer and inspect its navigation.
- Expected result: No About entry is shown and no import references the removed placeholder.
