import { build } from 'esbuild';
import { rmSync, mkdirSync, cpSync, readFileSync, writeFileSync, createWriteStream } from 'fs';
import { join } from 'path';
import process from 'process';
import archiver from 'archiver';
import { toFirefoxManifest } from './firefoxManifest.js';

const ALL_TARGETS = ['chrome', 'firefox'];
const args = process.argv.slice(2);
const isProduction = args.includes('--production');
const requested = ALL_TARGETS.filter((target) => args.includes(`--${target}`));
const targets = requested.length > 0 ? requested : ALL_TARGETS;

function loadManifest(target) {
  const chromeManifest = JSON.parse(readFileSync('src/manifest.chrome.json', 'utf8'));
  return target === 'firefox' ? toFirefoxManifest(chromeManifest) : chromeManifest;
}

async function buildTarget(target) {
  console.log(`Building for ${target}...`);
  const outdir = `build/${target}`;
  rmSync(outdir, { recursive: true, force: true });
  mkdirSync(outdir, { recursive: true });

  const staticDirs = [
    'assets',
    'dashboard',
    'editor',
    'offscreen',
    'popup',
    'content',
    'shared',
    'services',
    'background',
    '_locales',
  ];

  // Firefox has no offscreen API; its background page has a DOM instead.
  const skipDirs = target === 'firefox' ? new Set(['offscreen']) : new Set();
  for (const dir of staticDirs) {
    if (skipDirs.has(dir)) continue;
    cpSync(`src/${dir}`, join(outdir, dir), { recursive: true });
  }

  const manifest = loadManifest(target);
  writeFileSync(join(outdir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  await build({
    entryPoints: [
      'src/background/serviceWorker.js',
      'src/elementSelector/main.js',
      'src/content/greasyforkInterceptor.js',
      'src/shared/utils/urls.js',
      'src/popup/popup.js',
      'src/editor/editor.js',
      'src/dashboard/dashboard.js',
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
    },
  });

  const archiveName = `codetweak-${target}.zip`;
  const output = createWriteStream(join('build', archiveName));
  const archive = archiver('zip', { zlib: { level: 9 } });

  const closed = new Promise((resolve, reject) => {
    output.on('close', resolve);
    output.on('error', reject);
  });

  archive.on('error', (err) => {
    throw err;
  });

  archive.pipe(output);
  archive.directory(outdir, false);
  await archive.finalize();
  await closed;
  console.log(`Successfully created ${archiveName} (${archive.pointer()} bytes)`);
}

for (const target of targets) {
  await buildTarget(target);
}
