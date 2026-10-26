import { createServer } from 'node:http';
import { build } from 'esbuild';

// Render the production components with synthetic data, without Metro or native
// test doubles. No fixtures from this entry point are bundled into the app.
const result = await build({
  entryPoints: ['tests/responsive/entry.tsx'],
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'iife',
  jsx: 'automatic',
  resolveExtensions: [
    '.web.tsx',
    '.web.ts',
    '.web.js',
    '.tsx',
    '.ts',
    '.jsx',
    '.js',
    '.json',
  ],
  alias: { 'react-native': 'react-native-web' },
  // SVG's Android touch-sound module is behind Platform.OS === 'android'.
  // Keep that unreachable native require lazy, as Metro does for web exports.
  external: ['../fabric/NativeSvgSoundModule'],
  define: { 'process.env.NODE_ENV': '"test"', __DEV__: 'true' },
});
const script = result.outputFiles[0].contents;
createServer((request, response) => {
  if (request.url === '/app.js') {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(script);
    return;
  }
  response.setHeader('Content-Type', 'text/html');
  response.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>
    html,body,#root { margin:0; width:100%; height:100%; }
    #root { display:flex; flex-direction:column; }
    * { box-sizing:border-box; }
  </style></head><body><div id="root"></div><script src="/app.js"></script></body></html>`);
}).listen(4173, '127.0.0.1');
