import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
  plugins: [basicSsl()],
  server: {
    host: true, // Listen on all network interfaces for mobile access
    https: true, // Required for WebRTC/Camera access on mobile browsers
    port: 5173,
    watch: {
      ignored: ['**/public/assets/**', '**/*.mp4', '**/*.mp3']
    }
  }
});
