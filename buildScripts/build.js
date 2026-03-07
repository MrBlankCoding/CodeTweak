import { build } from 'esbuild';
import { rmSync, mkdirSync, cpSync, readFileSync, writeFileSync, createWriteStream } from 'fs';
import { join } from 'path';
import process from 'process';
import archiver from 'archiver';

const args = process.argv.slice(2);
const isProduction = args.includes('--production');
const target = 'chrome';

const outdir = `build/${target}`;
rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

const staticDirs = [
  'assets',
  'dashboard',
  'editor',
  'offscreen',
  'popup',
  'GM',
  'utils',
  'ai_dom_editor',
  '_locales',
];

for (const dir of staticDirs) {
  cpSync(`src/${dir}`, join(outdir, dir), { recursive: true });
}

const manifestPath = 'src/manifest.chrome.json';
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
writeFileSync(join(outdir, 'manifest.json'), JSON.stringify(manifest, null, 2));

await build({
  entryPoints: [
    'src/background/serviceWorker.js',
    'src/utils/content_bridge.js',
    'src/elementSelector/main.js',
    'src/utils/greasyfork_interceptor.js',
    'src/utils/urls.js',
    'src/popup/popup.js',
    'src/editor/editor.js',
    'src/dashboard/dashboard.js',
    'src/ai_dom_editor/editor/ai_dom_content.js',
    'src/ai_dom_editor/sidebar/ai_dom_sidebar.js',
    'src/ai_dom_editor/editor/ai_dom_editor.js',
    'src/ai_dom_editor/settings/ai_settings.js',
  ],
  bundle: true,
  outdir,
  logLevel: 'info',
  platform: 'browser',
  alias: {
    path: 'path-browserify',
    'node:path': 'path-browserify',
    assert: 'assert',
    fs: join(process.cwd(), 'buildScripts/browser_stubs/fs_stub.js'),
    'node:fs/promises': join(process.cwd(), 'buildScripts/browser_stubs/fs_promises_stub.js'),
    'isolated-vm': join(process.cwd(), 'buildScripts/browser_stubs/isolated_vm_stub.js'),
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(isProduction ? 'production' : 'development'),
    'process.env.BABEL_TYPES_8_BREAKING': 'false',
    'process.env.BROWSER': JSON.stringify('chrome'),
    'process.env.BUILD_TARGET': JSON.stringify('chrome'),
  },
});

if (isProduction) {
  const archiveName = `codetweak-${target}.zip`;
  const output = createWriteStream(join('build', archiveName));
  const archive = archiver('zip', { zlib: { level: 9 } });

  output.on('close', () => {
    console.log(`Successfully created ${archiveName} (${archive.pointer()} bytes)`);
  });

  archive.on('error', (err) => {
    throw err;
  });

  archive.pipe(output);
  archive.directory(outdir, false);
  await archive.finalize();
}
