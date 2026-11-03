import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// 코드에 기본값이 없는 jace-s 설정값. 프로덕션 빌드에서 빠지면 경고한다(빌드는 계속).
// 빠진 값에 해당하는 기능(협업·공지·로그인)은 실행 중에 꺼진다. 설명: docs/architecture/api-configuration.md
const REQUIRED_ENV_KEYS = ['VITE_API_URL', 'VITE_SITE_URL', 'VITE_NOTICE_APP_ID', 'VITE_LOGIN_HOSTS']

function checkRequiredEnv(): Plugin {
  return {
    name: 'check-required-env',
    apply: 'build',
    configResolved(config) {
      const env = { ...loadEnv(config.mode, config.envDir ?? process.cwd(), 'VITE_'), ...process.env }
      const missing = REQUIRED_ENV_KEYS.filter((key) => !env[key])
      if (missing.length > 0) {
        config.logger.warn(
          `\n[check-required-env] Missing: ${missing.join(', ')}. ` +
          'The related features will be disabled in this build. See .env.example.\n'
        )
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), checkRequiredEnv()],
  base: './', // Electron에서는 상대 경로 사용
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
  server: {
    port: 5173,
    host: '0.0.0.0', // 다른 컴퓨터에서 접속 가능하도록 설정
  },
})
