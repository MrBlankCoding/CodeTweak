
import { build } from 'esbuild';
import { rmSync, mkdirSync, cpSync } from 'fs';
import { join } from 'path';
import process from 'process';

const outdir = 'build';

// Clean the build directory
rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

// Copy public files
cpSync('src/assets', join(outdir, 'assets'), { recursive: true });
cpSync('src/dashboard', join(outdir, 'dashboard'), { recursive: true });

cpSync('src/editor', join(outdir, 'editor'), { recursive: true });
cpSync('src/offscreen', join(outdir, 'offscreen'), { recursive: true });
cpSync('src/popup', join(outdir, 'popup'), { recursive: true });

cpSync('src/manifest.json', join(outdir, 'manifest.json'));

// Copy feather-icons
mkdirSync(join(outdir, 'vendor'));



cpSync('src/utils', join(outdir, 'utils'), { recursive: true });

// Build the extension
build({
  entryPoints: [
    'src/background/background.js',
    'src/utils/content_bridge.js',
    'src/utils/elementSelector.js',
    'src/utils/gm_core.js',
    'src/utils/greasyfork_interceptor.js',
    'src/utils/inject.js',
    'src/utils/urlMatchPattern.js',
    'src/popup/popup.js',
    'src/editor/editor.js',
    'src/dashboard/dashboard.js',
  ],
  bundle: true,
  outdir: outdir,
  logLevel: 'info',
  platform: 'browser',
  external: [],
}).catch(() => process.exit(1));
