import { BrowserRouter, HashRouter, Routes, Route } from 'react-router-dom';
import DawPage from './pages/DawPage';
import { UIProvider } from './store/uiStore';
import { ToastContainer } from './components/Floating/Toast';
import MobileNotSupported from './components/MobileNotSupported';
import { useWindowWidth } from './hooks/useWindowWidth';
import { BREAKPOINTS } from './constants/ui';
import './App.css';

function App() {
  const windowWidth = useWindowWidth();
  const isMobile = windowWidth <= BREAKPOINTS.MOBILE_NOT_SUPPORTED;
  
  // Electron 패키징(file://)에서는 BrowserRouter가 pathname을 파일 경로로 해석해서
  // 라우트 매칭이 실패하며 빈 화면이 될 수 있음.
  const Router = window.location.protocol === 'file:' ? HashRouter : BrowserRouter;

  // 모바일 화면 크기일 때는 미지원 메시지 표시
  if (isMobile) {
    return <MobileNotSupported />;
  }

  return (
    <UIProvider>
      <Router>
        <Routes>
          <Route path="/" element={<DawPage />} />
        </Routes>
      </Router>
      <ToastContainer />
    </UIProvider>
  );
}

export default App;
