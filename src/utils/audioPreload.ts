import type { Project } from '../types/project';

export async function preloadPlaybackSamples(project?: Project): Promise<void> {
  try {
    const { playbackController } = await import('../core/audio/PlaybackController');
    if (project) {
      await playbackController.getEngine().prefetchSamplesForProject(project);
    } else {
      await playbackController.getEngine().ensureReady();
    }
  } catch {
    // Ignore preload errors; playback will retry on demand.
  }
}
