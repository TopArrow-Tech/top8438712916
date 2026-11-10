import {defineConfig} from 'vite';
export default defineConfig({
 publicDir:false,
 server:{host:'127.0.0.1',proxy:process.env.TOPARROW_APP_PORT?{'/api':`http://127.0.0.1:${process.env.TOPARROW_APP_PORT}`} : undefined},
 build:{outDir:'public',emptyOutDir:true,rollupOptions:{output:{manualChunks:{react:['react','react-dom'],charts:['echarts']}}}},
});
