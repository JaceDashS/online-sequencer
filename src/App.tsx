import { lazy, Suspense } from 'react';
import { BrowserRouter, HashRouter, Routes, Route } from 'react-router-dom';
import DawPage from './pages/DawPage';
import { UIProvider } from './store/uiStore';
import { ToastContainer } from './components/Floating/Toast';
import ServiceNoticeToasts from './components/Floating/ServiceNoticeToasts';
import MobileNotSupported from './components/MobileNotSupported';
import { useWindowWidth } from './hooks/useWindowWidth';
import { BREAKPOINTS } from './constants/ui';
import './App.css';

const QaPage = import.meta.env.DEV
  ? lazy(() => import('./pages/QaPage'))
  : null;

function App() {
  const windowWidth = useWindowWidth();
  const isMobile = windowWidth <= BREAKPOINTS.MOBILE_NOT_SUPPORTED;
  
  // Electron 패키징(file://)에서는 BrowserRouter가 pathname을 파일 경로로 해석해서
  // 라우트 매칭이 실패하며 빈 화면이 될 수 있음.
  const Router = window.location.protocol === 'file:' ? HashRouter : BrowserRouter;

  // 서비스 공지 토스트는 모바일 안내 화면에서도 보이며, 화면 전환 시 다시 마운트되지 않도록 같은 위치에 둔다.
  return (
    <>
      {isMobile ? <MobileNotSupported /> : renderDaw(Router)}
      <ServiceNoticeToasts />
    </>
  );
}

function renderDaw(Router: typeof BrowserRouter | typeof HashRouter) {
  return (
    <UIProvider>
      <Router>
        <Routes>
          <Route path="/" element={<DawPage />} />
          {QaPage && (
            <Route
              path="/qa"
              element={(
                <Suspense fallback={<div>QA 화면을 불러오는 중입니다...</div>}>
                  <QaPage />
                </Suspense>
              )}
            />
          )}
        </Routes>
      </Router>
      <ToastContainer />
    </UIProvider>
  );
}

export default App;
