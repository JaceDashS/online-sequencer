# Navigation Scenarios

- Design: [Navigation](../../../design/app/10-navigation.md).

## Navigation Without About
- Input: Online Sequencer.
- Steps: Open the sequencer and inspect its navigation.
- Expected result: No About entry is shown and no import references the removed placeholder.
- Verification 2026-11-13: Production build passed. Reference search confirmed the deleted placeholder has no consumers.
