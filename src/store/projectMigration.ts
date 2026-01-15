import type { Project, MidiPart, MidiProjectTiming, LegacyProject, LegacyPart } from '../types/project';
import { 
  migrateProjectToTicks, 
  needsMigration,
  createSimpleTiming,
  migrateLegacyPartToTickPart
} from '../utils/midiTickUtils';

/**
 * 프로젝트 로드 시 마이그레이션을 수행합니다.
 * 
 * @param project - 마이그레이션할 프로젝트
 * @returns 마이그레이션된 프로젝트
 */
export const migrateProjectAtLoad = (project: Project): Project => {
  if (needsMigration(project)) {
    const migrated = migrateProjectToTicks(project);
    
    // timing 필드가 없으면 레거시 bpm/timeSignature로부터 생성
    if (!migrated.timing) {
      const legacyProject = project as LegacyProject;
      const bpm = legacyProject.bpm ?? 120;
      const timeSignature = legacyProject.timeSignature ?? [4, 4];
      migrated.timing = createSimpleTiming(bpm, timeSignature);
    }
    
    return migrated;
  }
  return project;
};

/**
 * 레거시 파트를 Tick 기반 파트로 마이그레이션합니다.
 * 
 * @param part - 마이그레이션할 파트
 * @param timing - 프로젝트 타이밍 정보
 * @returns 마이그레이션된 파트
 */
export const migrateLegacyPart = (part: MidiPart | LegacyPart, timing: MidiProjectTiming): MidiPart => {
  // Tick 필드가 없으면 레거시 measure 필드로부터 변환
  if (part.startTick === undefined || part.durationTicks === undefined) {
    const legacyPart = part as LegacyPart;
    if (legacyPart.measureStart !== undefined && legacyPart.measureDuration !== undefined) {
      return migrateLegacyPartToTickPart(part, timing);
    }
  }
  return part as MidiPart;
};

