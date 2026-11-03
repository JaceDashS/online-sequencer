/**
 * 화면 위 가운데 토스트 공용 영역
 *
 * 서비스 공지 토스트와 앱 토스트(오류·경고 등)가 같은 위치에서 겹치지 않도록 한 줄로 쌓는다.
 * 순서: 서비스 공지 → 앱 토스트. 영역 밖은 클릭이 아래로 통과한다.
 */

export type TopToastSlot = 'notices' | 'app';

const HOST_ID = 'top-toast-stack';
const SLOT_ORDER: TopToastSlot[] = ['notices', 'app'];

function ensureHost(): HTMLElement {
  let host = document.getElementById(HOST_ID);
  if (!host) {
    host = document.createElement('div');
    host.id = HOST_ID;
    Object.assign(host.style, {
      position: 'fixed',
      top: '12px',
      left: '50%',
      transform: 'translateX(-50%)',
      width: 'min(512px, calc(100vw - 24px))',
      zIndex: '10001',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      pointerEvents: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
    for (const slot of SLOT_ORDER) {
      const element = document.createElement('div');
      element.dataset.toastSlot = slot;
      Object.assign(element.style, { display: 'contents' });
      host.appendChild(element);
    }
    document.body.appendChild(host);
  }
  return host;
}

/**
 * 공용 영역의 슬롯 요소를 돌려줍니다. 처음 호출할 때 document.body에 만듭니다.
 */
export function getTopToastSlot(slot: TopToastSlot): HTMLElement {
  const host = ensureHost();
  return host.querySelector<HTMLElement>(`[data-toast-slot="${slot}"]`) ?? host;
}
