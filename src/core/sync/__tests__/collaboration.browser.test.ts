/**
 * Collaboration Browser Test
 * 브라우저 콘솔에서 실행할 수 있는 테스트 함수들
 * 
 * 사용법:
 * 1. 브라우저 개발자 도구 콘솔 열기
 * 2. 이 파일의 함수들을 import하거나 직접 실행
 * 3. 테스트 시나리오에 따라 함수 호출
 */

import { CollaborationManager } from '../CollaborationManager';
import { SyncManager } from '../SyncManager';
import { getOrCreateClientId } from '../utils/uuid';

/**
 * 전역 테스트 인스턴스 (브라우저 콘솔에서 접근 가능)
 */
declare global {
  interface Window {
    testCollaboration?: {
      host?: CollaborationManager;
      guest?: CollaborationManager;
      hostSync?: SyncManager;
      guestSync?: SyncManager;
      clientId?: string;
    };
  }
}

/**
 * 테스트 헬퍼 함수들
 */
export const testCollaboration = {
  /**
   * 호스트 테스트 인스턴스 생성
   */
  async createHost(serverUrl?: string): Promise<CollaborationManager> {
    console.log('=== [TEST] Creating Host ===');
    const host = new CollaborationManager(serverUrl);
    window.testCollaboration = window.testCollaboration || {};
    window.testCollaboration.host = host;
    window.testCollaboration.clientId = getOrCreateClientId();
    
    console.log('[TEST] Host created, clientId:', window.testCollaboration.clientId);
    return host;
  },

  /**
   * 게스트 테스트 인스턴스 생성
   */
  async createGuest(serverUrl?: string): Promise<CollaborationManager> {
    console.log('=== [TEST] Creating Guest ===');
    const guest = new CollaborationManager(serverUrl);
    window.testCollaboration = window.testCollaboration || {};
    window.testCollaboration.guest = guest;
    
    console.log('[TEST] Guest created');
    return guest;
  },

  /**
   * 호스트: 룸 생성 및 호스팅 시작
   */
  async hostStartHosting(): Promise<string> {
    if (!window.testCollaboration?.host) {
      throw new Error('Host not created. Call testCollaboration.createHost() first.');
    }
    
    console.log('=== [TEST] Host Starting Hosting ===');
    const roomCode = await window.testCollaboration.host.startHosting();
    console.log('[TEST] ✅ Host started hosting, roomCode:', roomCode);
    return roomCode;
  },

  /**
   * 호스트: 조인 허용 활성화
   */
  async hostAllowJoin(duration: number = 60): Promise<void> {
    if (!window.testCollaboration?.host) {
      throw new Error('Host not created.');
    }
    
    console.log('=== [TEST] Host Allowing Join ===');
    await window.testCollaboration.host.allowJoin(duration);
    console.log('[TEST] ✅ Host allowed join for', duration, 'seconds');
  },

  /**
   * 게스트: 룸 조인
   */
  async guestJoinRoom(roomCode: string): Promise<void> {
    if (!window.testCollaboration?.guest) {
      throw new Error('Guest not created. Call testCollaboration.createGuest() first.');
    }
    
    console.log('=== [TEST] Guest Joining Room ===');
    console.log('[TEST] Room code:', roomCode);
    await window.testCollaboration.guest.joinRoom(roomCode);
    console.log('[TEST] ✅ Guest joined room:', roomCode);
  },

  /**
   * 호스트: 게스트에게 테스트 메시지 전송
   */
  async hostSendTestMessage(guestId: string, message: string): Promise<void> {
    if (!window.testCollaboration?.host) {
      throw new Error('Host not created.');
    }
    
    console.log('=== [TEST] Host Sending Test Message ===');
    console.log('[TEST] To:', guestId);
    console.log('[TEST] Message:', message);
    
    const testMessage = {
      type: 'change' as const,
      from: window.testCollaboration.host.getClientId(),
      to: guestId,
      timestamp: Date.now(),
      data: {
        test: true,
        message: message
      }
    };
    
    window.testCollaboration.host.sendToGuest(guestId, testMessage);
    console.log('[TEST] ✅ Test message sent');
  },

  /**
   * 게스트: 호스트에게 테스트 메시지 전송
   */
  async guestSendTestMessage(message: string): Promise<void> {
    if (!window.testCollaboration?.guest) {
      throw new Error('Guest not created.');
    }
    
    console.log('=== [TEST] Guest Sending Test Message ===');
    console.log('[TEST] Message:', message);
    
    const testMessage = {
      type: 'change' as const,
      from: window.testCollaboration.guest.getClientId(),
      timestamp: Date.now(),
      data: {
        test: true,
        message: message
      }
    };
    
    window.testCollaboration.guest.sendToHost(testMessage);
    console.log('[TEST] ✅ Test message sent');
  },

  /**
   * 연결 상태 확인
   */
  getConnectionStatus(): void {
    console.log('=== [TEST] Connection Status ===');
    
    if (window.testCollaboration?.host) {
      const guests = window.testCollaboration.host.getConnectedGuests();
      console.log('[TEST] Host - Connected guests:', guests);
      console.log('[TEST] Host - Room code:', window.testCollaboration.host.getRoomCode());
      console.log('[TEST] Host - Is host:', window.testCollaboration.host.getIsHost());
    } else {
      console.log('[TEST] Host - Not created');
    }
    
    if (window.testCollaboration?.guest) {
      console.log('[TEST] Guest - Room code:', window.testCollaboration.guest.getRoomCode());
      console.log('[TEST] Guest - Host ID:', window.testCollaboration.guest.getHostId());
      console.log('[TEST] Guest - Is host:', window.testCollaboration.guest.getIsHost());
    } else {
      console.log('[TEST] Guest - Not created');
    }
  },

  /**
   * 전체 연결 종료
   */
  disconnectAll(): void {
    console.log('=== [TEST] Disconnecting All ===');
    
    if (window.testCollaboration?.host) {
      window.testCollaboration.host.disconnect();
      console.log('[TEST] ✅ Host disconnected');
    }
    
    if (window.testCollaboration?.guest) {
      window.testCollaboration.guest.disconnect();
      console.log('[TEST] ✅ Guest disconnected');
    }
    
    if (window.testCollaboration?.hostSync) {
      window.testCollaboration.hostSync.disconnect();
      console.log('[TEST] ✅ Host SyncManager disconnected');
    }
    
    if (window.testCollaboration?.guestSync) {
      window.testCollaboration.guestSync.disconnect();
      console.log('[TEST] ✅ Guest SyncManager disconnected');
    }
    
    window.testCollaboration = undefined;
    console.log('[TEST] ✅ All connections closed');
  },

  /**
   * 전체 테스트 시나리오 실행
   */
  async runFullTest(serverUrl?: string): Promise<void> {
    console.log('=== [TEST] Running Full Test Scenario ===');
    console.log('[TEST] Server URL:', serverUrl || 'default');
    
    try {
      // 1. 호스트 생성
      await this.createHost(serverUrl);
      
      // 2. 호스트 시작
      const roomCode = await this.hostStartHosting();
      
      // 3. 조인 허용
      await this.hostAllowJoin(60);
      
      // 4. 게스트 생성
      await this.createGuest(serverUrl);
      
      // 5. 게스트 조인
      await this.guestJoinRoom(roomCode);
      
      // 6. 잠시 대기 (P2P 연결 수립 대기)
      console.log('[TEST] Waiting 5 seconds for P2P connection...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // 7. 연결 상태 확인
      this.getConnectionStatus();
      
      // 8. 테스트 메시지 전송
      if (window.testCollaboration?.host && window.testCollaboration?.guest) {
        const guestId = window.testCollaboration.guest.getClientId();
        await this.hostSendTestMessage(guestId, 'Hello from Host!');
        await new Promise(resolve => setTimeout(resolve, 1000));
        await this.guestSendTestMessage('Hello from Guest!');
      }
      
      console.log('[TEST] ✅ Full test completed');
    } catch (error) {
      console.error('[TEST] ❌ Test failed:', error);
      throw error;
    }
  }
};

// 브라우저 콘솔에서 접근 가능하도록 전역에 등록
if (typeof window !== 'undefined') {
  (window as any).testCollaboration = testCollaboration;
  console.log('========================================');
  console.log('[TEST] Collaboration Test Functions');
  console.log('========================================');
  console.log('[TEST] Available at: window.testCollaboration');
  console.log('[TEST]');
  console.log('[TEST] Quick Start:');
  console.log('  await window.testCollaboration.runFullTest()');
  console.log('[TEST]');
  console.log('[TEST] Manual Steps:');
  console.log('  1. await window.testCollaboration.createHost()');
  console.log('  2. await window.testCollaboration.hostStartHosting()');
  console.log('  3. await window.testCollaboration.hostAllowJoin(60)');
  console.log('  4. await window.testCollaboration.createGuest()');
  console.log('  5. await window.testCollaboration.guestJoinRoom("ROOM_CODE")');
  console.log('[TEST]');
  console.log('[TEST] Utilities:');
  console.log('  - window.testCollaboration.getConnectionStatus()');
  console.log('  - window.testCollaboration.disconnectAll()');
  console.log('========================================');
}

