import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
  plugins: [basicSsl()],
  server: {
    host: true, // Listen on all network addresses for mobile access
    https: true,
    port: 5173
  }
});
