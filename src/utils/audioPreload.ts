import type { Project } from '../types/project';
import { playbackAudioEngine } from '../core/audio/playbackAudioEngine';

export async function preloadPlaybackSamples(project?: Project): Promise<void> {
  try {
    await Promise.resolve();
    if (project) {
      await playbackAudioEngine.prefetchSamplesForProject(project);
    } else {
      await playbackAudioEngine.ensureReady();
    }
  } catch {
    // Ignore preload errors; playback will retry on demand.
  }
}
