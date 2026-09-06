export function registerEditorEventListeners(editor) {
  const { ui, elements, codeEditorManager, state, deobfuscator } = editor;

  ui.on('sidebarChanged', () => {
    editor.markAsUnsaved();
  });

  ui.on('settingChanged', (settings) => {
    codeEditorManager.applySettings(settings);
  });

  editor.setupSidebarIconHandlers();

  elements.saveBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    editor.saveScript();
  });

  elements.generateHeaderBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    editor.generateHeader();
  });

  elements.deobfuscateBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    deobfuscator.deobfuscate(elements.deobfuscateBtn);
  });

  const callbacks = {
    saveScript: () => editor.saveScript(),
    exportScript: () => editor.exportScript(),
    loadSettings: () => codeEditorManager.loadSettings(),
    saveSettings: (settings) => {
      codeEditorManager.saveSettings(settings);
      codeEditorManager.applySettings(settings);
    },
    markAsDirty: () => editor.markAsDirty(),
    markAsUnsaved: () => editor.markAsUnsaved(),
    debouncedSave: () => editor._debouncedSave(),
  };

  ui.setupSettingsModal(callbacks);
  ui.setupUrlManagement({
    markAsUnsaved: () => {
      editor.markAsUnsaved();
      editor._debouncedSidebarSync();
    },
    updateSectionVisibility: () => editor.updateSectionVisibility(),
  });
  ui.setupResourceManagement({
    ...callbacks,
    markAsUnsaved: () => {
      editor.markAsUnsaved();
      editor._debouncedSidebarSync();
    },
    updateSectionVisibility: () => editor.updateSectionVisibility(),
  });

  const handleChange = () => {
    editor.markAsDirty();
    if (state.isAutosaveEnabled) {
      editor._debouncedSave();
    }
    editor._debouncedSidebarSync();
  };

  const formInputs = [
    elements.scriptName,
    elements.scriptAuthor,
    elements.scriptLicense,
    elements.scriptIcon,
    elements.scriptVersion,
    elements.scriptDescription,
    elements.runAt,
    elements.injectInto,
    elements.targetUrl,
  ];

  formInputs.forEach((input) => {
    if (input) {
      input.addEventListener('change', handleChange);
      input.addEventListener('input', handleChange);
    }
  });

  elements.scriptIcon?.addEventListener('input', () => editor.updateIconPreview());

  // GM API checkboxes
  Object.values(editor.gmApiDefinitions).forEach((api) => {
    const element = elements[api.el];
    if (element) {
      element.addEventListener('change', () => {
        handleChange();
        editor.updateApiCount();
      });
    }
  });

  editor.setupResourceApiListeners();
  editor.updateSectionVisibility();

  if (elements.apiSearch) {
    elements.apiSearch.addEventListener('input', () => {
      const query = elements.apiSearch.value.toLowerCase();
      const checkboxes = elements.sidebar.querySelectorAll('.api-list .form-group-checkbox');
      checkboxes.forEach((cb) => {
        const label = cb.querySelector('label').textContent.toLowerCase();
        const shouldShow = label.includes(query);
        cb.style.display = shouldShow ? 'flex' : 'none';
      });
    });
  }
}
