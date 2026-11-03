import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// 테마를 첫 렌더 전에 적용 (툴바가 없는 모바일 안내 화면·서비스 공지 토스트도 테마를 따르도록)
try {
  const savedTheme = localStorage.getItem('theme')
  document.documentElement.setAttribute('data-theme', savedTheme === 'light' ? 'light' : 'dark')
} catch {
  document.documentElement.setAttribute('data-theme', 'dark')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
