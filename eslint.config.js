import globals from "globals";

export default [
  {
    ignores: ["build/**", "docs/**", "docs-src/.vitepress/cache/**"],
  },
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.es2021,
        ...globals.webextensions,
        GM_addElement: "readonly",
        GM_addStyle: "readonly",
        GM_setValue: "readonly",
        GM_getValue: "readonly",
        GM_deleteValue: "readonly",
        GM_listValues: "readonly",
        GM_openInTab: "readonly",
        GM_notification: "readonly",
        GM_getResourceText: "readonly",
        GM_getResourceURL: "readonly",
        GM_xmlhttpRequest: "readonly",
        GM_setInnerHTML: "readonly",
        GM_createHTML: "readonly"
      }
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }]
    }
  }
];
