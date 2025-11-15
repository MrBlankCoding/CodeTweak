// Build mv3 for Firefox

import { build } from "esbuild";
import {
  rmSync,
  mkdirSync,
  cpSync,
  readFileSync,
  writeFileSync,
  createWriteStream,
} from "fs";
import { join } from "path";
import process from "process";
import archiver from "archiver";

const args = process.argv.slice(2);
const isProduction = args.includes("--production");
const browser = "firefox";
const outdir = `build/${browser}`;

rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

const copyDirs = [
  "assets",
  "dashboard",
  "editor",
  "offscreen",
  "popup",
  "GM",
  "utils",
  "ai_dom_editor",
  "_locales",
];
for (const dir of copyDirs) {
  cpSync(`src/${dir}`, join(outdir, dir), { recursive: true });
}

const chromeManifest = JSON.parse(readFileSync("src/manifest.json", "utf8"));
const firefoxManifest = { ...chromeManifest };

// Firefox MV3 uses background.scripts instead of background.service_worker
if (firefoxManifest.background?.service_worker) {
  firefoxManifest.background = {
    scripts: [firefoxManifest.background.service_worker],
    type: "module",
  };
}

// Remove Chrome-specific permissions
firefoxManifest.permissions = (firefoxManifest.permissions || []).filter(
  (p) => p !== "offscreen"
);

// Remove the 'world' property from content_scripts (not supported in Firefox)
if (firefoxManifest.content_scripts) {
  firefoxManifest.content_scripts = firefoxManifest.content_scripts.map(
    (cs) => {
      const { world, ...rest } = cs;
      return rest;
    }
  );
}

firefoxManifest.browser_specific_settings = {
  gecko: {
    id: "codetweak@MrBlankCoding",
    strict_min_version: "128.0",
    data_collection_permissions: {
      required: ["none"],
    },
  },
};

writeFileSync(
  join(outdir, "manifest.json"),
  JSON.stringify(firefoxManifest, null, 2)
);

await build({
  entryPoints: [
    "src/background/background.js",
    "src/utils/content_bridge.js",
    "src/elementSelector/main.js",
    "src/GM/gm_core.js",
    "src/utils/greasyfork_interceptor.js",
    "src/utils/inject.js",
    "src/utils/urls.js",
    "src/popup/popup.js",
    "src/editor/editor.js",
    "src/dashboard/dashboard.js",
    "src/ai_dom_editor/ai_dom_content.js",
    "src/ai_dom_editor/ai_dom_sidebar.js",
    "src/ai_dom_editor/ai_dom_editor.js",
    "src/ai_dom_editor/ai_settings.js",
  ],
  bundle: true,
  outdir,
  logLevel: "info",
  platform: "browser",
  define: {
    "process.env.BROWSER": JSON.stringify(browser),
  },
});

// --- ZIP IN PRODUCTION --- //
if (isProduction) {
  const archiveName = `codetweak-firefox.zip`;
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
