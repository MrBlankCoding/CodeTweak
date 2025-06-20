// utils/i18n.js
/* global chrome */
// Simple runtime internationalisation handler for CodeTweak UI pages.
// Looks up visible English strings and attributes and swaps them with
// the user-locale translation using chrome.i18n.
// Only strings present in the map will be translated.

(function () {
  if (!('i18n' in chrome)) {
    return; // Not running inside extension context
  }

  // Map of English UI strings -> i18n message keys.
  const textToKey = {
    'Save Script': 'save_script',
    'Unsaved Changes': 'unsaved_changes',
    'Script Information': 'script_information',
    'GM API Access': 'gm_api_access',
    'Required Scripts': 'required_scripts',
    'Script Resources': 'script_resources',
    'Execution Settings': 'execution_settings',
    'Script Name': 'script_name',
    'Author': 'author',
    'Version': 'version',
    'Description': 'description',
    'License': 'license',
    'Target URLs': 'target_urls',
    'Pattern Builder': 'pattern_builder',
    'Run Timing': 'run_timing',
    'Generate': 'generate',
    'Insert': 'insert',
    'Help & Shortcuts': 'help_shortcuts',
    'Editor Settings': 'editor_settings',
    'Dashboard': 'dashboard',
    'Create': 'create',
    'Browse Scripts': 'browse_scripts',
    'New Script': 'new_script',
    'Scripts': 'scripts_tab',
    'Settings': 'settings_tab',
    'About': 'about_tab'
  };

  function translateNodeText(node) {
    const orig = node.textContent.trim();
    const key = textToKey[orig];
    if (key) {
      const msg = chrome.i18n.getMessage(key);
      if (msg) node.textContent = msg;
    }
  }

  function translateAttributes(el, attr) {
    const val = el.getAttribute(attr);
    if (!val) return;
    const key = textToKey[val.trim()];
    if (key) {
      const msg = chrome.i18n.getMessage(key);
      if (msg) el.setAttribute(attr, msg);
    }
  }

  function runTranslation() {
    // Translate text content of all text nodes
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    let n;
    while ((n = walker.nextNode())) {
      translateNodeText(n);
    }

    // Translate common attributes
    document.querySelectorAll('[title], [placeholder], [aria-label]').forEach((el) => {
      ['title', 'placeholder', 'aria-label'].forEach((attr) => translateAttributes(el, attr));
    });
  }

  document.addEventListener('DOMContentLoaded', runTranslation);
})();
