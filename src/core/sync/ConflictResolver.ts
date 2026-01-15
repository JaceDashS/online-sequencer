/**
 * ConflictResolver
 * 동시 편집 시 발생하는 충돌을 해결합니다.
 * Last-Write-Wins (LWW) 전략을 사용합니다.
 */

import type { RemoteChange } from './types/p2p';

/**
 * 충돌 정보
 */
export interface Conflict {
  local: RemoteChange;
  remote: RemoteChange;
  conflictType: 'same-resource' | 'dependent-resource';
}

/**
 * ConflictResolver
 * 충돌 감지 및 해결 로직
 */
export class ConflictResolver {
  /**
   * 충돌 감지
   * 두 변경사항이 충돌하는지 확인합니다.
   */
  detectConflict(local: RemoteChange, remote: RemoteChange): boolean {
    // 같은 클라이언트에서 온 메시지는 충돌이 아님 (중복 방지)
    if (local.clientId === remote.clientId) {
      return false;
    }

    // 같은 리소스에 대한 변경인지 확인
    if (this.isSameResource(local, remote)) {
      // 같은 타임스탬프는 충돌이 아님 (같은 변경)
      if (local.timestamp === remote.timestamp) {
        return false;
      }
      return true;
    }

    // 의존적인 리소스 간 충돌 확인
    if (this.isDependentResource(local, remote)) {
      return true;
    }

    return false;
  }

  /**
   * 같은 리소스인지 확인
   */
  private isSameResource(local: RemoteChange, remote: RemoteChange): boolean {
    // 같은 타입이어야 함
    if (local.type !== remote.type) {
      return false;
    }

    // 타입별로 리소스 식별자 확인
    switch (local.type) {
      case 'channel-volume':
      case 'channel-pan':
      case 'channel-effect':
        return local.trackId === remote.trackId;

      case 'master-volume':
      case 'master-pan':
      case 'master-effect':
        // 마스터는 하나뿐이므로 타입만 같으면 충돌
        return true;

      case 'midi-part':
        return local.partId === remote.partId;

      case 'midi-note':
        return local.partId === remote.partId && 
               local.noteId === remote.noteId;

      case 'bpm':
      case 'time-signature':
        // 프로젝트 레벨 설정은 하나뿐이므로 타입만 같으면 충돌
        return true;

      default:
        return false;
    }
  }

  /**
   * 의존적인 리소스인지 확인
   * 예: 미디파트 삭제와 노트 추가 등
   */
  private isDependentResource(local: RemoteChange, remote: RemoteChange): boolean {
    // 미디파트 삭제와 해당 파트의 노트 변경
    if (local.type === 'midi-part' && local.value?.action === 'remove') {
      if (remote.type === 'midi-note' && remote.partId === local.partId) {
        return true;
      }
    }
    if (remote.type === 'midi-part' && remote.value?.action === 'remove') {
      if (local.type === 'midi-note' && local.partId === remote.partId) {
        return true;
      }
    }

    // 트랙 삭제와 해당 트랙의 파트 변경 (현재는 트랙 삭제 동기화 없음)
    // 추후 확장 가능

    return false;
  }

  /**
   * 충돌 해결 (LWW 전략)
   * 나중에 작성된 변경사항을 우선합니다.
   */
  resolveConflict(conflict: Conflict): RemoteChange {
    const { local, remote } = conflict;

    // Last-Write-Wins: 타임스탬프가 더 큰 것을 선택
    if (remote.timestamp > local.timestamp) {
      return remote;
    } else if (local.timestamp > remote.timestamp) {
      return local;
    }

    // 타임스탬프가 같으면 (거의 불가능하지만) clientId로 결정 (사전순)
    return local.clientId > remote.clientId ? local : remote;
  }

  /**
   * 독립적인 변경사항 병합
   * 충돌하지 않는 여러 변경사항을 병합합니다.
   */
  mergeIndependentChanges(changes: RemoteChange[]): RemoteChange[] {
    // 이미 충돌이 해결된 변경사항들이므로 그대로 반환
    // 필요시 정렬 (타임스탬프 순)
    return changes.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * 충돌 그룹화
   * 여러 변경사항 중 충돌하는 것들을 그룹화합니다.
   */
  groupConflicts(changes: RemoteChange[]): Map<string, RemoteChange[]> {
    const groups = new Map<string, RemoteChange[]>();

    for (const change of changes) {
      const key = this.getConflictKey(change);
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(change);
    }

    return groups;
  }

  /**
   * 충돌 키 생성
   * 같은 리소스에 대한 변경사항을 식별하는 키
   */
  private getConflictKey(change: RemoteChange): string {
    switch (change.type) {
      case 'channel-volume':
      case 'channel-pan':
      case 'channel-effect':
        return `${change.type}:${change.trackId}`;

      case 'master-volume':
      case 'master-pan':
      case 'master-effect':
        return change.type;

      case 'midi-part':
        return `${change.type}:${change.partId}`;

      case 'midi-note':
        return `${change.type}:${change.partId}:${change.noteId}`;

      case 'bpm':
      case 'time-signature':
        return change.type;

      default:
        return `${change.type}:${change.timestamp}`;
    }
  }
}
