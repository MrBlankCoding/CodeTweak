import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const locales = ['en', 'es', 'fr'];
const localeFiles = locales.reduce((acc, lang) => {
  acc[lang] = JSON.parse(
    fs.readFileSync(path.join(rootDir, 'src', '_locales', lang, 'messages.json'), 'utf8')
  );
  return acc;
}, {});

const seenKeys = new Set();
const missingKeys = {}; // { key: [languages_missing_it] }

function scanFiles(dir) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.git' && file !== 'build' && file !== 'docs-src') {
        scanFiles(fullPath);
      }
    } else if (file.endsWith('.html') || file.endsWith('.js')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const htmlRegex = /data-i18n(?:-attr|-title|-placeholder)?="([^"]+)"/g;
      let match;
      while ((match = htmlRegex.exec(content)) !== null) {
        const key = match[1];
        if (key !== 'title' && key !== 'placeholder') {
          seenKeys.add(key);
        }
      }

      const jsRegex = /getMessage(?:Sync)?\(['"]([^'"]+)['"]\)/g;
      while ((match = jsRegex.exec(content)) !== null) {
        const key = match[1];
        if (key !== 'key' && key !== 'title' && key !== 'placeholder') {
          seenKeys.add(key);
        }
      }
    }
  }
}

console.log('Scanning codebase for i18n keys...');
scanFiles(path.join(rootDir, 'src'));

let hasError = false;

for (const key of seenKeys) {
  for (const lang of locales) {
    if (!localeFiles[lang][key]) {
      if (!missingKeys[key]) missingKeys[key] = [];
      missingKeys[key].push(lang);
      hasError = true;
    }
  }
}

const enKeys = Object.keys(localeFiles['en']);
for (const key of enKeys) {
  for (const lang of locales) {
    if (lang === 'en') continue;
    if (!localeFiles[lang][key]) {
      if (!missingKeys[key]) missingKeys[key] = [];
      if (!missingKeys[key].includes(lang)) {
        missingKeys[key].push(lang);
      }
      hasError = true;
    }
  }
}

if (hasError) {
  console.error('\x1b[31m%s\x1b[0m', 'i18n Coverage Check Failed!');
  console.table(
    Object.entries(missingKeys).map(([key, langs]) => ({
      Key: key,
      'Missing In': langs.join(', '),
    }))
  );
  process.exit(1);
} else {
  console.log(
    '\x1b[32m%s\x1b[0m',
    'i18n Coverage Check Passed! All keys are present in all languages.'
  );
  process.exit(0);
}
