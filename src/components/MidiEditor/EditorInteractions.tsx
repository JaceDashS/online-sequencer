import React from 'react';

/**
 * EditorInteractions 컴포넌트 Props
 * Phase 7.6: 에디터 상호작용 로직 분리
 * 
 * 이 컴포넌트는 보이지 않는 컴포넌트로, 이벤트 핸들러를 제공하는 역할을 합니다.
 * 실제 렌더링은 PianoRoll 컴포넌트에서 처리합니다.
 */
export interface EditorInteractionsProps {
  /** 피아노 롤 마우스 다운 핸들러 */
  onMouseDown: (e: React.MouseEvent) => void;
  /** 피아노 롤 마우스 무브 핸들러 */
  onMouseMove: (e: React.MouseEvent) => void;
  /** 피아노 롤 마우스 업 핸들러 */
  onMouseUp: (e: React.MouseEvent) => void;
  /** 피아노 롤 더블 클릭 핸들러 */
  onDoubleClick: (e: React.MouseEvent) => void;
  /** 자식 요소 */
  children: React.ReactNode;
}

/**
 * EditorInteractions 컴포넌트
 * Phase 7.6: MidiEditor의 상호작용 로직을 담당하는 컴포넌트
 * 
 * 이 컴포넌트는 보이지 않는 래퍼 컴포넌트로, 이벤트 핸들러를 자식 요소에 전달합니다.
 * 실제 상호작용 로직은 MidiEditor에서 정의되고, 이 컴포넌트를 통해 전달됩니다.
 */
export const EditorInteractions: React.FC<EditorInteractionsProps> = ({
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onDoubleClick,
  children,
}) => {
  // 이 컴포넌트는 단순히 이벤트 핸들러를 자식에 전달하는 역할만 합니다.
  // 실제 상호작용 로직은 MidiEditor에서 정의되어 props로 전달됩니다.
  
  return (
    <>
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child as React.ReactElement<any>, {
            onMouseDown,
            onMouseMove,
            onMouseUp,
            onDoubleClick,
          });
        }
        return child;
      })}
    </>
  );
};

