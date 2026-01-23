export async function preloadPlaybackSamples(): Promise<void> {
  try {
    const { playbackController } = await import('../core/audio/PlaybackController');
    await playbackController.getEngine().ensureReady();
  } catch {
    // Ignore preload errors; playback will retry on demand.
  }
}
