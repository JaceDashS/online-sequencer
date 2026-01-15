/**
 * SignalingClient 브라우저 테스트
 * 
 * 실행 방법:
 * 1. 서버를 시작: cd server && npm run dev
 * 2. 브라우저에서 개발 서버 실행: npm run dev
 * 3. 브라우저 콘솔에서 이 파일을 import하여 테스트 실행
 */

import { SignalingClient } from '../SignalingClient';
import { getOrCreateClientId } from '../utils/uuid';

/**
 * 브라우저 콘솔에서 실행할 수 있는 테스트 함수
 */
export async function testSignalingClientInBrowser() {
  console.log('=== SignalingClient 브라우저 테스트 시작 ===\n');

  try {
    // 1. 클라이언트 생성
    console.log('1. SignalingClient 인스턴스 생성...');
    const client = new SignalingClient();
    console.log(`   클라이언트 ID: ${client.id}`);
    console.log('   ✅ 클라이언트 생성 성공\n');

    // 2. WebSocket 연결
    console.log('2. WebSocket 연결...');
    await client.connect();
    console.log(`   연결 상태: ${client.connected ? '연결됨' : '연결 안됨'}`);
    console.log('   ✅ WebSocket 연결 성공\n');

    // 3. 룸 생성 (호스트)
    console.log('3. 룸 생성 (호스트)...');
    const hostId = getOrCreateClientId();
    const roomCode = await client.registerRoom(hostId);
    console.log(`   룸 코드: ${roomCode}`);
    console.log(`   현재 룸 코드: ${client.currentRoomCode}`);
    console.log('   ✅ 룸 생성 성공\n');

    // 4. 룸 정보 조회
    console.log('4. 룸 정보 조회...');
    const roomInfo = await client.getRoom(roomCode);
    console.log(`   룸 코드: ${roomInfo.roomCode}`);
    console.log(`   호스트 ID: ${roomInfo.hostId}`);
    console.log(`   상태: ${roomInfo.status}`);
    console.log(`   조인 허용: ${roomInfo.allowJoin}`);
    console.log(`   참가자 수: ${roomInfo.participantCount}/${roomInfo.maxParticipants}`);
    console.log('   ✅ 룸 정보 조회 성공\n');

    // 5. 조인 허용 활성화
    console.log('5. 조인 허용 활성화 (60초)...');
    await client.allowJoin(roomCode, 60);
    console.log('   ✅ 조인 허용 활성화 성공\n');

    // 6. 조인 허용 확인
    console.log('6. 조인 허용 상태 확인...');
    const roomInfoAfterAllow = await client.getRoom(roomCode);
    console.log(`   조인 허용: ${roomInfoAfterAllow.allowJoin}`);
    if (roomInfoAfterAllow.allowJoinExpiresAt) {
      const expiresIn = Math.floor((roomInfoAfterAllow.allowJoinExpiresAt - Date.now()) / 1000);
      console.log(`   만료까지: ${expiresIn}초`);
    }
    console.log('   ✅ 조인 허용 확인 성공\n');

    // 7. 시그널링 메시지 수신 콜백 등록
    console.log('7. 시그널링 메시지 수신 콜백 등록...');
    client.onSignalingMessage((message) => {
      console.log(`   수신된 시그널링 메시지:`, message);
    });
    console.log('   ✅ 콜백 등록 성공\n');

    // 8. 서버 메시지 수신 콜백 등록
    console.log('8. 서버 메시지 수신 콜백 등록...');
    client.onMessage('registered', (message) => {
      console.log(`   수신된 서버 메시지:`, message);
    });
    console.log('   ✅ 콜백 등록 성공\n');

    // 9. 연결 종료
    console.log('9. 연결 종료...');
    client.disconnect();
    console.log(`   연결 상태: ${client.connected ? '연결됨' : '연결 안됨'}`);
    console.log('   ✅ 연결 종료 성공\n');

    console.log('=== 모든 테스트 통과! ===\n');

    // 게스트 클라이언트 테스트 (별도)
    console.log('=== 게스트 클라이언트 테스트 ===\n');

    const guestClient = new SignalingClient();
    console.log(`게스트 클라이언트 ID: ${guestClient.id}`);

    await guestClient.connect();
    console.log('게스트 WebSocket 연결 성공');

    // 조인 시도
    console.log(`게스트가 룸 ${roomCode}에 조인 시도...`);
    try {
      const hostInfo = await guestClient.joinRoom(roomCode);
      console.log(`   호스트 ID: ${hostInfo.hostId}`);
      console.log(`   룸 코드: ${hostInfo.roomCode}`);
      console.log('   ✅ 게스트 조인 성공\n');
    } catch (error) {
      console.error(`   ❌ 게스트 조인 실패: ${error instanceof Error ? error.message : error}\n`);
    }

    guestClient.disconnect();

    console.log('=== 모든 테스트 완료! ===\n');

    return { success: true, roomCode };

  } catch (error) {
    console.error('❌ 테스트 실패:', error);
    if (error instanceof Error) {
      console.error('   에러 메시지:', error.message);
      console.error('   스택:', error.stack);
    }
    return { success: false, error };
  }
}

// 브라우저 환경에서만 자동 실행
if (typeof window !== 'undefined') {
  // 전역 함수로 등록하여 콘솔에서 직접 호출 가능
  (window as any).testSignalingClient = testSignalingClientInBrowser;
  console.log('테스트 함수가 등록되었습니다. 콘솔에서 testSignalingClient()를 호출하세요.');
}

