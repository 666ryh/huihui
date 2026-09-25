import {defineConfig} from 'vite';
import uni from '@dcloudio/vite-plugin-uni';

const apiOrigin = 'https://www.ryh6666.xyz';
export default defineConfig({
  base: '/huihui/',
  plugins: [(uni.default || uni)()],
  server: {
    host: '127.0.0.1', port: 4175, strictPort: true,
    proxy: {'/api': {target: apiOrigin, changeOrigin: true, configure(proxy) {
      proxy.on('proxyReq', (outgoing, incoming) => {
        if (['http://127.0.0.1:4175', 'http://localhost:4175'].includes(incoming.headers.origin)) outgoing.setHeader('origin', apiOrigin);
      });
    }}}
  }
});
