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
if (firefoxManifest.background?.service_worker) {
  firefoxManifest.background = {
    scripts: [firefoxManifest.background.service_worker],
    type: "module",
  };
}

firefoxManifest.permissions = (firefoxManifest.permissions || []).filter(
  (p) => p !== "offscreen"
);

if (firefoxManifest.content_scripts) {
  firefoxManifest.content_scripts = firefoxManifest.content_scripts.map(
    (cs) => {
      const { world, ...rest } = cs; // eslint-disable-line no-unused-vars
      return rest;
    }
  );
}

firefoxManifest.browser_specific_settings = {
  gecko: {
    id: "MrBlankCoding@CodeTweak",
    strict_min_version: "140.0",
    data_collection_permissions: {
      required: ["none"],
    },
  },
  gecko_android: {
    strict_min_version: "142.0",
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
    "src/ai_dom_editor/editor/ai_dom_content.js",
    "src/ai_dom_editor/sidebar/ai_dom_sidebar.js",
    "src/ai_dom_editor/editor/ai_dom_editor.js",
    "src/ai_dom_editor/settings/ai_settings.js",
  ],
  bundle: true,
  outdir,
  logLevel: "info",
  platform: "browser",
  define: {
    "process.env.BROWSER": JSON.stringify(browser),
    global: "window",
  },
});

// --- POST-BUILD CLEANUP --- //
// Remove eval and Function("return this") which violate CSP
const filesToCleanup = [
  join(outdir, "ai_dom_editor/editor/ai_dom_editor.js"),
  join(outdir, "editor/editor.js"),
  join(outdir, "dashboard/dashboard.js"),
  join(outdir, "popup/popup.js"),
  join(outdir, "ai_dom_editor/settings/ai_settings.js"),
  join(outdir, "GM/gm_core.js"),
];

for (const file of filesToCleanup) {
  try {
    let content = readFileSync(file, "utf8");
    let changed = false;

    if (content.includes('Function("return this")')) {
      content = content.replace(/Function\("return this"\)/g, "(function() { return window; })");
      changed = true;
    }
    if (/new\s+Function\s*\(\s*['"]unsafeWindow['"]\s*,\s*userCode\s*\)/.test(content)) {
      content = content.replace(/new\s+Function\s*\(\s*['"]unsafeWindow['"]\s*,\s*userCode\s*\)/g, "(function(){ throw new EvalError('Function constructor is blocked in Firefox'); })");
      changed = true;
    }

    const evalPatterns = [
      /eval\("this"\)/g,
      /\(1,\s*eval\)\("this"\)/g,
    ];

    for (const pattern of evalPatterns) {
      if (pattern.test(content)) {
        content = content.replace(pattern, "window");
        changed = true;
      }
    }

    const iframeWritePattern = /iframeDocument\.write\([^;]*document\.F=Object[^;]*\);/g;
    if (iframeWritePattern.test(content)) {
      content = content.replace(iframeWritePattern, "iframeDocument.F = Object;");
      changed = true;
    }

    if (changed) {
      writeFileSync(file, content);
      console.log(`Cleaned up CSP-violating patterns in ${file}`);
    }
  } catch (err) {
    console.warn(`Could not cleanup ${file}: ${err.message}`);
  }
}

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
