import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser, // adds `window`, `document`, etc.
        chrome: "readonly", // fixes 'chrome is not defined'
      },
    },
    plugins: { js },
    rules: {
      ...js.configs.recommended.rules,
    },
  },
]);
