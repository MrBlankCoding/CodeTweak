import { build } from "esbuild";
import {
  rmSync,
  mkdirSync,
  cpSync,
  writeFileSync,
  createWriteStream,
} from "fs";
import { join } from "path";
import process from "process";
import archiver from "archiver";

const args = process.argv.slice(2);
const isProduction = args.includes("--production");
const browserFlag = args.find((arg) => arg.startsWith("--browser="));
const browser = browserFlag ? browserFlag.split("=")[1] : "chrome";

const outdir = `build/${browser}`;
rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

const staticDirs = [
  "assets",
  "dashboard",
  "editor",
  "offscreen",
  "popup",
  "GM",
  "utils",
];
for (const dir of staticDirs) {
  cpSync(`src/${dir}`, join(outdir, dir), { recursive: true });
}

const manifest = {
  manifest_version: 3,
  name: "CodeTweak",
  version: "1.0.0",
  description:
    "Inject custom JavaScript code into specific websites based on user-defined settings",
  permissions: [
    "storage",
    "tabs",
    "scripting",
    "webNavigation",
    "contextMenus",
    "notifications",
    "offscreen",
    "clipboardWrite",
    "downloads",
  ],
  host_permissions: ["http://*/*", "https://*/*"],
  background: {
    service_worker: "background/background.js",
    type: "module",
  },
  action: {
    default_popup: "popup/popup.html",
    default_icon: {
      16: "assets/icons/icon16.png",
      48: "assets/icons/icon48.png",
      128: "assets/icons/icon128.png",
    },
  },
  icons: {
    16: "assets/icons/icon16.png",
    48: "assets/icons/icon48.png",
    128: "assets/icons/icon128.png",
  },
  content_scripts: [
    {
      matches: ["http://*/*", "https://*/*"],
      js: ["utils/elementSelector.js"],
      css: ["assets/styles/elementSelector.css"],
      run_at: "document_start",
    },
    {
      matches: ["http://*/*", "https://*/*"],
      js: ["utils/content_bridge.js"],
      run_at: "document_start",
      world: "ISOLATED",
    },
    {
      matches: ["https://greasyfork.org/*"],
      js: ["utils/greasyfork_interceptor.js"],
      run_at: "document_start",
    },
  ],
  web_accessible_resources: [
    {
      resources: ["utils/*", "GM/*"],
      matches: ["<all_urls>"],
    },
  ],
};

writeFileSync(join(outdir, "manifest.json"), JSON.stringify(manifest, null, 2));
await build({
  entryPoints: [
    "src/background/background.js",
    "src/utils/content_bridge.js",
    "src/utils/elementSelector.js",
    "src/GM/gm_core.js",
    "src/utils/greasyfork_interceptor.js",
    "src/utils/inject.js",
    "src/utils/urls.js",
    "src/popup/popup.js",
    "src/editor/editor.js",
    "src/dashboard/dashboard.js",
  ],
  bundle: true,
  outdir,
  logLevel: "info",
  platform: "browser",
  define: {
    "process.env.BROWSER": JSON.stringify(browser),
  },
});
if (isProduction) {
  const archiveName = `codetweak-${browser}.zip`;
  const output = createWriteStream(join("build", archiveName));
  const archive = archiver("zip", { zlib: { level: 9 } });

  output.on("close", () => {
    console.log(
      `Successfully created ${archiveName} (${archive.pointer()} bytes)`
    );
  });

  archive.on("error", (err) => {
    throw err;
  });

  archive.pipe(output);
  archive.directory(outdir, false);
  await archive.finalize();
}
