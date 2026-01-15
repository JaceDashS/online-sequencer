import { playbackController } from '../core/audio/PlaybackController';
import { terminatePlaybackClockWorker } from './playbackClock';
import { terminateDebugLoggerWorker } from './debugLogger';

/**
 * 모든 리소스를 정리하고 해제하는 전역 cleanup 함수
 * 
 * @returns Promise<void> - 비동기 리소스 해제 완료
 * 
 * @remarks
 * - AudioEngine dispose
 * - 모든 Worker 종료
 * - 페이지 전환 또는 앱 종료 시 호출해야 합니다
 * - 에러가 발생해도 다른 리소스 정리는 계속 진행합니다
 */
export async function cleanupAllResources(): Promise<void> {
  const errors: Error[] = [];

  // 1. PlaybackController dispose (AudioEngine 포함)
  try {
    await playbackController.dispose();
  } catch (error) {
    errors.push(error instanceof Error ? error : new Error(String(error)));
    console.warn('[resourceCleanup] Error disposing PlaybackController:', error);
  }

  // 2. playbackClock Worker 종료
  try {
    terminatePlaybackClockWorker();
  } catch (error) {
    errors.push(error instanceof Error ? error : new Error(String(error)));
    console.warn('[resourceCleanup] Error terminating playbackClock worker:', error);
  }

  // 3. debugLogger Worker 종료 (버퍼에 남은 로그 전송)
  try {
    await terminateDebugLoggerWorker(true);
  } catch (error) {
    errors.push(error instanceof Error ? error : new Error(String(error)));
    console.warn('[resourceCleanup] Error terminating debugLogger worker:', error);
  }

  // 에러가 발생했으면 로그만 출력하고 계속 진행
  if (errors.length > 0) {
    console.warn('[resourceCleanup] Some errors occurred during cleanup:', errors);
  }
}

