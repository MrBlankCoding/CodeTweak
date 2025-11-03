
import { build } from 'esbuild';
import { rmSync, mkdirSync, cpSync, readFileSync, writeFileSync, createWriteStream } from 'fs';
import { join } from 'path';
import process from 'process';
import archiver from 'archiver';

const args = process.argv.slice(2);
const browserFlag = args.find(arg => arg.startsWith('--browser='));
const browser = browserFlag ? browserFlag.split('=')[1] : 'chrome';
const isProduction = args.includes('--production');

const outdir = `build/${browser}`;

rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });
cpSync('src/assets', join(outdir, 'assets'), { recursive: true });
cpSync('src/dashboard', join(outdir, 'dashboard'), { recursive: true });
cpSync('src/editor', join(outdir, 'editor'), { recursive: true });
cpSync('src/offscreen', join(outdir, 'offscreen'), { recursive: true });
cpSync('src/popup', join(outdir, 'popup'), { recursive: true });
cpSync('src/GM', join(outdir, 'GM'), { recursive: true });

let manifest = JSON.parse(readFileSync('src/manifest.json', 'utf8'));

  if (browser === 'firefox') {
    manifest.applications = {
      gecko: {
        id: 'codetweak@example.com',
      },
    };
    manifest.permissions = manifest.permissions.filter(perm => perm !== 'offscreen');
    manifest.browser_specific_settings = {
      gecko: {
              data_collection_permissions: {
                unrestricted: true,
                // description: "This extension does not collect any personal data."
              },
            },
          };   
    if (manifest.background && manifest.background.service_worker) {
      manifest.background.scripts = [manifest.background.service_worker];
      delete manifest.background.service_worker;
      delete manifest.background.type;
    }
  }
writeFileSync(join(outdir, 'manifest.json'), JSON.stringify(manifest, null, 2));

mkdirSync(join(outdir, 'vendor'));
cpSync('src/utils', join(outdir, 'utils'), { recursive: true });
build({
  entryPoints: [
    'src/background/background.js',
    'src/utils/content_bridge.js',
    'src/utils/elementSelector.js',
    'src/GM/gm_core.js',
    'src/utils/greasyfork_interceptor.js',
    'src/utils/inject.js',
    'src/utils/urls.js',
    'src/popup/popup.js',
    'src/editor/editor.js',
    'src/dashboard/dashboard.js',
  ],
  bundle: true,
  outdir: outdir,
  logLevel: 'info',
  platform: 'browser',
  define: {
    'process.env.BROWSER': JSON.stringify(browser),
  },
  external: [],
}).then(() => {
  if (browser === 'firefox' && isProduction) {
    const archiveName = `codetweak-firefox.zip`;
    const output = createWriteStream(join('build', archiveName));
    const archive = archiver('zip', {
      zlib: { level: 9 }
    });

    output.on('close', () => {
      console.log(`Successfully created ${archiveName}: ${archive.pointer()} total bytes`);
    });

    archive.on('error', (err) => {
      throw err;
    });

    archive.pipe(output);
    archive.directory(outdir, false);
    archive.finalize();
  }
}).catch(() => process.exit(1));
