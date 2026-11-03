import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

import { applyTheme, getStoredTheme } from './utils/theme'

// 테마를 첫 렌더 전에 한 번 적용 (툴바가 없는 모바일 안내 화면·서비스 공지 토스트도 테마를 따르도록)
applyTheme(getStoredTheme())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
