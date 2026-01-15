/**
 * ICE 서버 설정
 * WebRTC P2P 연결을 위한 STUN/TURN 서버 설정
 */

/**
 * ICE 서버 설정을 반환합니다.
 * STUN 서버는 무료이며, TURN 서버는 환경 변수에서 가져옵니다.
 */
export const getIceServers = (): RTCConfiguration => {
  return {
    iceServers: [
      // STUN 서버 (무료, NAT 탐지용)
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      // TURN 서버 (필요시, 환경 변수에서 가져오기)
      ...(import.meta.env.VITE_TURN_SERVER_URL ? [{
        urls: import.meta.env.VITE_TURN_SERVER_URL,
        username: import.meta.env.VITE_TURN_USERNAME || '',
        credential: import.meta.env.VITE_TURN_CREDENTIAL || ''
      }] : [])
    ],
    iceCandidatePoolSize: 10
  };
};

