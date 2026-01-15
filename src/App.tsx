import { BrowserRouter, HashRouter, Routes, Route } from 'react-router-dom';
import DawPage from './pages/DawPage';
import { UIProvider } from './store/uiStore';
import './App.css';

function App() {
  // Electron 패키징(file://)에서는 BrowserRouter가 pathname을 파일 경로로 해석해서
  // 라우트 매칭이 실패하며 빈 화면이 될 수 있음.
  const Router = window.location.protocol === 'file:' ? HashRouter : BrowserRouter;

  return (
    <UIProvider>
      <Router>
        <Routes>
          <Route path="/" element={<DawPage />} />
        </Routes>
      </Router>
    </UIProvider>
  );
}

export default App;
