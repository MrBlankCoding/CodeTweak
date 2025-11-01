import feather from 'feather-icons';
import {
    UIManager,
    StorageManager,
    FormValidator
} from './editor_managers.js';
import {
    CodeEditorManager
} from './editor_settings.js';
import {
    buildTampermonkeyMetadata,
    parseUserScriptMetadata
} from '../utils/metadataParser.js';
import {
    GM_API_DEFINITIONS,
    getApiElementIds
} from '../utils/gmApiDefinitions.js';
class ScriptEditor {
    constructor() {
        this.config = {
            RUN_MODES: {
                DOCUMENT_START: 'document_start',
                DOCUMENT_END: 'document_end',
                DOCUMENT_IDLE: 'document_idle'
            },
            DEFAULT_VERSION: '1.0.0',
            SIDEBAR_BREAKPOINT: 900,
            AUTOSAVE_DELAY: 1220,
            STATUS_TIMEOUT: 2e3
        };
        this.state = {
            isEditMode: !1,
            scriptId: null,
            hasUnsavedChanges: !1,
            isSidebarVisible: window.innerWidth > this.config.SIDEBAR_BREAKPOINT,
            lintingEnabled: localStorage.getItem('lintingEnabled') === 'true',
            isAutosaveEnabled: localStorage.getItem('autosaveEnabled') === 'true',
            autosaveTimeout: null,
            headerSyncTimeout: null,
            sidebarSyncTimeout: null,
            isUpdatingFromSidebar: !1,
            hasUserInteraction: !1,
            codeEditor: null
        };
        this.elements = this.cacheElements();
        this.ui = new UIManager(this.elements, this.state, this.config);
        this.storage = new StorageManager();
        this.validator = new FormValidator(this.elements);
        this.gmApiDefinitions = GM_API_DEFINITIONS;
        this.codeEditorManager = new CodeEditorManager(this.elements, this.state, this.config, this.gmApiDefinitions)
    }
    _debouncedSave() {
        this.state.autosaveTimeout && clearTimeout(this.state.autosaveTimeout);
        this.state.autosaveTimeout = setTimeout(async () => {
            if (this.state.hasUnsavedChanges && this.state.isEditMode) {
                try {
                    await this.saveScript(!0)
                } catch (e) {
                    console.error('Autosave failed:', e);
                    this.ui && this.ui.showStatusMessage && this.ui.showStatusMessage('Autosave failed', 'error')
                }
            }
        }, this.config.AUTOSAVE_DELAY)
    }
    _debouncedHeaderSync() {
        this.state.headerSyncTimeout && clearTimeout(this.state.headerSyncTimeout);
        this.state.headerSyncTimeout = setTimeout(() => {
            this.state.isUpdatingFromSidebar || this.syncHeaderToSidebar()
        }, 500)
    }
    _debouncedSidebarSync() {
        this.state.sidebarSyncTimeout && clearTimeout(this.state.sidebarSyncTimeout);
        this.state.sidebarSyncTimeout = setTimeout(() => {
            this.syncSidebarToHeader()
        }, 500)
    }
    syncHeaderToSidebar() {
        try {
            const e = this.codeEditorManager.getValue(),
                t = e.match(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/);
            if (!t) return;
            const s = parseUserScriptMetadata(t[0]);
            s.name && (this.elements.scriptName.value = s.name);
            s.author && (this.elements.scriptAuthor.value = s.author);
            s.version && (this.elements.scriptVersion.value = s.version);
            s.description && (this.elements.scriptDescription.value = s.description);
            s.license && (this.elements.scriptLicense.value = s.license);
            s.icon && (this.elements.scriptIcon.value = s.icon);
            s.runAt && (this.elements.runAt.value = s.runAt.replace(/-/g, '_'));
            this.elements.urlList && (this.elements.urlList.innerHTML = '');
            Array.isArray(s.matches) && s.matches.length > 0 && s.matches.forEach(e => this.ui.addUrlToList(e));
            this.gmApiDefinitions && Object.values(this.gmApiDefinitions).forEach(e => {
                const t = this.elements[e.el];
                t && (t.checked = !1)
            });
            s.gmApis && Object.keys(s.gmApis).forEach(e => {
                const t = this.elements[e];
                t && (t.checked = !!s.gmApis[e])
            });
            this.updateApiCount();
            this.updateSectionVisibility();
            this.elements.resourceList && (this.elements.resourceList.innerHTML = '');
            Array.isArray(s.resources) && s.resources.length > 0 && s.resources.forEach(e => this.ui.addResourceToList(e.name, e.url));
            this.elements.requireList && (this.elements.requireList.innerHTML = '');
            Array.isArray(s.requires) && s.requires.length > 0 && s.requires.forEach(e => this.ui.addRequireToList(e))
        } catch {}
    }
    syncSidebarToHeader() {
        try {
            const e = this.codeEditorManager.getValue(),
                t = e.match(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/),
                s = this.gatherScriptData(),
                i = buildTampermonkeyMetadata(s);
            let a;
            a = t ? e.replace(t[0], i) : i + '\n\n' + e;
            if (a !== e) {
                this.state.isUpdatingFromSidebar = !0;
                this.codeEditorManager.setValue(a);
                setTimeout(() => {
                    this.state.isUpdatingFromSidebar = !1
                }, 100)
            }
        } catch {}
    }
    markAsDirty() {
        if (this.state.hasUnsavedChanges && !this.state.isEditMode) return;
        this.state.hasUnsavedChanges = !0;
        this.ui.updateScriptStatus(!0)
    }
    cacheElements() {
        const e = ['pageTitle', 'settingsBtn', 'closeSettings', 'scriptName', 'scriptAuthor', 'scriptLicense', 'scriptIcon', 'targetUrl', 'runAt', 'scriptVersion', 'scriptDescription', 'saveBtn', 'waitForSelector', 'statusMessage', 'lintBtn', 'lintBtnText', 'cursorInfo', 'scriptStatusBadge', 'autosaveBtn', 'autosaveBtnText', 'codeEditor', 'minimap', ...getApiElementIds(), 'apiSearch', 'apiCountBadge', 'addUrlBtn', 'urlList', 'targetUrl', 'patternBaseUrl', 'patternScope', 'generatePatternBtn', 'generatedPattern', 'generatedPatternGroup', 'insertPatternBtn', 'addResourceBtn', 'resourceName', 'resourceURL', 'resourceList', 'addRequireBtn', 'requireURL', 'requireList', 'helpButton', 'generateHeaderBtn'],
            t = {};
        e.forEach(e => {
            t[e] = document.getElementById(e)
        });
        t.sidebar = document.querySelector('.sidebar');
        t.sidebarIconBar = document.querySelector('.sidebar-icon-bar');
        t.sidebarContentArea = document.querySelector('.sidebar-content-area');
        t.sidebarIconBtns = document.querySelectorAll('.sidebar-icon-btn');
        t.sidebarPanels = document.querySelectorAll('.sidebar-panel');
        t.sectionToggles = document.querySelectorAll('.section-toggle');
        t.mainContent = document.querySelector('.main-content');
        t.settingsModal = document.getElementById('settingsModal');
        t.requiresSection = document.getElementById('requiresSection');
        t.status = null;
        return t
    }
    async init() {
        try {
            this.setDefaultValues();
            this.state.isAutosaveEnabled = localStorage.getItem('autosaveEnabled') !== 'false';
            this.state.lintingEnabled = localStorage.getItem('lintingEnabled') !== 'false';
            await this.codeEditorManager.initializeCodeEditor();
            this.codeEditorManager.toggleLinting(this.state.lintingEnabled);
            this.codeEditorManager.setSaveCallback(() => this.saveScript());
            this.codeEditorManager.setChangeCallback(() => {
                this.markAsDirty();
                this.state.isAutosaveEnabled && this._debouncedSave();
                this._debouncedHeaderSync();
                this.updateSectionVisibility()
            });
            this.codeEditorManager.setImportCallback(e => this.handleScriptImport(e));
            this.codeEditorManager.setStatusCallback((e, t) => {
                e ? this.ui.showStatusMessage(e, t) : this.ui.clearStatusMessage()
            });
            this.ui.updateScriptStatus(this.state.hasUnsavedChanges);
            await this.parseUrlParams();
            this.setupEditorMode();
            this.ui.initializeCollapsibleSections();
            this.ui.updateSidebarState();
            this.registerEventListeners();
            this.ui && typeof this.ui.on === 'function' && this.ui.on('saveRequested', async () => {
                await this.saveScript();
                this.ui.showStatusMessage('Script saved!', 'success', 2e3)
            });
            this.setupBackgroundConnection();
            this.codeEditorManager.updateEditorLintAndAutocomplete();
            setTimeout(() => this.codeEditorManager.focus(), 100)
        } catch (e) {
            console.error('Failed to initialize editor:', e);
            this.ui.showStatusMessage('Failed to initialize editor', 'error')
        }
    }
    setDefaultValues() {
        this.elements.scriptVersion.value || (this.elements.scriptVersion.value = this.config.DEFAULT_VERSION)
    }
    async parseUrlParams() {
        const e = new URLSearchParams(window.location.search);
        this.state.scriptId = e.get('id');
        const t = e.get('targetUrl'),
            s = e.get('template'),
            i = e.get('importId');
        this.state.isEditMode = Boolean(this.state.scriptId);
        if (t && this.elements.targetUrl) {
            const e = decodeURIComponent(t);
            this.elements.targetUrl.value = e;
            this.ui.addUrlToList(e)
        }
        s ? this.codeEditorManager.insertTemplateCode(decodeURIComponent(s)) : !this.state.isEditMode && !this.codeEditorManager.getValue() && this.codeEditorManager.insertDefaultTemplate();
        i && await this.loadImportedScript(i)
    }
    handleScriptImport(e) {
        try {
            const {
                code: t,
                ...s
            } = e, i = {
                code: t
            };
            s.name && (i.name = s.name);
            s.version && (i.version = s.version);
            s.description && (i.description = s.description);
            s.author && (i.author = s.author);
            s.namespace && (i.namespace = s.namespace);
            s.runAt && (i.runAt = s.runAt);
            s.license && (i.license = s.license);
            s.icon && (i.icon = s.icon);
            s.matches?.length && (i.targetUrls = [...new Set(s.matches)]);
            s.requires?.length && (i.requires = s.requires);
            s.resources?.length && (i.resources = s.resources);
            s.gmApis && Object.entries(s.gmApis).forEach(([e, t]) => {
                t && this.elements[e] && (i[e] = !0)
            });
            this.populateFormWithScript(i);
            this.codeEditorManager.setValue(t);
            this.ui.showStatusMessage('Script metadata imported successfully', 'success')
        } catch (e) {
            console.error('Error handling script import:', e);
            this.ui.showStatusMessage('Failed to import script metadata', 'error')
        }
    }
    async loadImportedScript(e) {
        try {
            const t = `tempImport_${e}`,
                s = await chrome.storage.local.get(t),
                i = s[t];
            if (!i) return;
            const {
                code: a
            } = i, r = parseUserScriptMetadata(a);
            this.handleScriptImport({
                code: a,
                ...r
            });
            this.state.hasUnsavedChanges = !0;
            this.ui.updateScriptStatus(!0);
            await chrome.storage.local.remove(t)
        } catch (e) {
            console.error('Error loading imported script:', e);
            this.ui.showStatusMessage('Failed to load imported script', 'error')
        }
    }
    async setupEditorMode() {
        this.state.isEditMode ? await this.loadScript(this.state.scriptId) : this.codeEditorManager.getValue() || this.codeEditorManager.insertDefaultTemplate();
        this.ui.updateScriptStatus(this.state.hasUnsavedChanges)
    }
    hasRequireInCode() {
        return /@require\s+\S+/i.test(this.codeEditorManager?.getValue() || '')
    }
    hasResourceInCode() {
        return /@resource\s+\S+/i.test(this.codeEditorManager?.getValue() || '')
    }
    toggleResourcesSection() {
        const e = document.getElementById('resources-panel'),
            t = document.querySelector('[data-section="resources"]'),
            s = this.elements.gmGetResourceText?.checked || this.elements.gmGetResourceURL?.checked,
            i = this.elements.resourceList?.children.length > 0,
            a = this.hasResourceInCode(),
            r = s || i || a;
        e && (r ? e.classList.remove('hidden') : e.classList.add('hidden'));
        if (t) {
            r ? t.style.display = 'flex' : (t.style.display = 'none', t.classList.contains('active') && (this.elements.sidebar?.classList.remove('expanded', 'has-active-panel'), t.classList.remove('active'), this.elements.sidebarContentArea && (this.elements.sidebarContentArea.style.display = 'none')))
        }
    }
    toggleRequiredScriptsSection() {
        const e = document.getElementById('requires-panel'),
            t = document.querySelector('[data-section="requires"]'),
            s = this.elements.requireList?.children.length > 0,
            i = this.hasRequireInCode(),
            a = s || i;
        e && (a ? e.classList.remove('hidden') : e.classList.add('hidden'));
        if (t) {
            a ? t.style.display = 'flex' : (t.style.display = 'none', t.classList.contains('active') && (this.elements.sidebar?.classList.remove('expanded', 'has-active-panel'), t.classList.remove('active'), this.elements.sidebarContentArea && (this.elements.sidebarContentArea.style.display = 'none')))
        }
    }
    updateSectionVisibility() {
        this.toggleResourcesSection();
        this.toggleRequiredScriptsSection()
    }
    setupResourceApiListeners() {
        [this.elements.gmGetResourceText, this.elements.gmGetResourceURL].forEach(e => {
            e && e.addEventListener('change', () => {
                this.updateSectionVisibility()
            })
        })
    }
    registerEventListeners() {
        this.ui.on('sidebarChanged', () => {
            this.markAsUnsaved()
        });
        this.ui.on('settingChanged', e => {
            this.codeEditorManager.applySettings(e)
        });
        this.setupSidebarIconHandlers();
        this.elements.saveBtn?.addEventListener('click', e => {
            e.preventDefault();
            this.saveScript()
        });
        this.elements.generateHeaderBtn?.addEventListener('click', e => {
            e.preventDefault();
            this.generateTampermonkeyHeader()
        });
        const e = {
            saveScript: () => this.saveScript(),
            exportScript: () => this.exportScript(),
            loadSettings: () => this.codeEditorManager.loadSettings(),
            saveSettings: t => {
                this.codeEditorManager.saveSettings(t);
                this.codeEditorManager.applySettings(t)
            },
            markAsDirty: () => this.markAsDirty(),
            markAsUnsaved: () => this.markAsUnsaved(),
            debouncedSave: () => this._debouncedSave()
        };
        this.ui.setupSettingsModal(e);
        this.ui.setupUrlManagement({
            markAsUnsaved: () => {
                this.markAsUnsaved();
                this._debouncedSidebarSync()
            },
            updateSectionVisibility: () => this.updateSectionVisibility()
        });
        this.ui.setupResourceManagement({
            ...e,
            markAsUnsaved: () => {
                this.markAsUnsaved();
                this._debouncedSidebarSync()
            },
            updateSectionVisibility: () => this.updateSectionVisibility()
        });
        const t = () => {
            this.markAsDirty();
            this.state.isAutosaveEnabled && this._debouncedSave();
            this._debouncedSidebarSync()
        };
        [this.elements.scriptName, this.elements.scriptAuthor, this.elements.scriptLicense, this.elements.scriptIcon, this.elements.scriptVersion, this.elements.scriptDescription, this.elements.runAt, this.elements.targetUrl].forEach(e => {
            e && (e.addEventListener('change', t), e.addEventListener('input', t))
        });
        Object.values(this.gmApiDefinitions).forEach(e => {
            const s = this.elements[e.el];
            s && s.addEventListener('change', () => {
                t();
                this.updateApiCount()
            })
        });
        this.setupResourceApiListeners();
        this.updateSectionVisibility();
        this.elements.apiSearch && this.elements.apiSearch.addEventListener('input', () => {
            const e = this.elements.apiSearch.value.toLowerCase(),
                t = this.elements.sidebar.querySelectorAll('.api-list .form-group-checkbox');
            t.forEach(t => {
                const s = t.querySelector('label').textContent.toLowerCase().includes(e);
                t.style.display = s ? 'flex' : 'none'
            })
        })
    }
    setupSidebarIconHandlers() {
        const e = this.elements.sidebarIconBtns;
        if (!e) return;
        this.elements.sidebar.classList.remove('expanded', 'has-active-panel');
        e.forEach(e => e.classList.remove('active'));
        this.elements.sidebarPanels.forEach(e => e.classList.remove('active'));
        this.elements.sidebarContentArea.style.display = 'none';
        e.forEach(t => {
            t.addEventListener('click', () => {
                const s = t.getAttribute('data-section');
                if (!s) return;
                const i = document.getElementById(`${s}-panel`);
                if (!i) return;
                const a = t.classList.contains('active');
                a ? (this.elements.sidebar.classList.remove('expanded', 'has-active-panel'), t.classList.remove('active'), i.classList.remove('active'), this.elements.sidebarContentArea.style.display = 'none', this.elements.sidebarContentArea.style.width = '0') : (this.elements.sidebar.classList.add('has-active-panel', 'expanded'), e.forEach(e => e.classList.remove('active')), t.classList.add('active'), this.elements.sidebarPanels.forEach(e => e.classList.remove('active')), i.classList.add('active'), this.elements.sidebarContentArea.style.display = 'flex', this.elements.sidebarContentArea.style.width = '280px')
            })
        })
    }
    markAsUnsaved() {
        this.state.hasUnsavedChanges = !0;
        this.ui.updateScriptStatus(this.state.hasUnsavedChanges)
    }
    async loadScript(e) {
        try {
            const t = await this.storage.getScript(e);
            if (!t) {
                this.ui.showStatusMessage('Script not found.', 'error');
                return
            }
            this.populateFormWithScript(t);
            this.state.hasUnsavedChanges = !1;
            this.ui.updateScriptStatus(this.state.hasUnsavedChanges);
            this.codeEditorManager.updateEditorLintAndAutocomplete()
        } catch (e) {
            console.error('Error loading script:', e);
            this.ui.showStatusMessage(`Failed to load script: ${e.message}`, 'error')
        }
    }
    populateFormWithScript(e) {
        this.elements.scriptName.value = e.name || '';
        this.elements.scriptAuthor.value = e.author || '';
        this.elements.runAt.value = e.runAt || 'document_idle';
        this.elements.scriptVersion.value = e.version || this.config.DEFAULT_VERSION;
        this.elements.scriptDescription.value = e.description || '';
        this.elements.scriptLicense.value = e.license || '';
        this.elements.scriptIcon.value = e.icon || '';
        this.codeEditorManager.setValue(e.code || '');
        this.elements.urlList && (this.elements.urlList.innerHTML = '');
        e.targetUrls?.forEach(e => this.ui.addUrlToList(e));
        this.elements.gmSetValue && (this.elements.gmSetValue.checked = !!e.gmSetValue);
        this.elements.gmGetValue && (this.elements.gmGetValue.checked = !!e.gmGetValue);
        this.elements.gmDeleteValue && (this.elements.gmDeleteValue.checked = !!e.gmDeleteValue);
        this.elements.gmListValues && (this.elements.gmListValues.checked = !!e.gmListValues);
        this.elements.gmOpenInTab && (this.elements.gmOpenInTab.checked = !!e.gmOpenInTab);
        this.elements.gmNotification && (this.elements.gmNotification.checked = !!e.gmNotification);
        this.elements.gmGetResourceText && (this.elements.gmGetResourceText.checked = !!e.gmGetResourceText);
        this.elements.gmGetResourceURL && (this.elements.gmGetResourceURL.checked = !!e.gmGetResourceURL);
        this.elements.gmSetClipboard && (this.elements.gmSetClipboard.checked = !!e.gmSetClipboard);
        this.elements.gmAddStyle && (this.elements.gmAddStyle.checked = !!e.gmAddStyle);
        this.elements.gmAddElement && (this.elements.gmAddElement.checked = !!e.gmAddElement);
        this.elements.gmRegisterMenuCommand && (this.elements.gmRegisterMenuCommand.checked = !!e.gmRegisterMenuCommand);
        this.elements.gmXmlhttpRequest && (this.elements.gmXmlhttpRequest.checked = !!e.gmXmlhttpRequest);
        this.elements.unsafeWindow && (this.elements.unsafeWindow.checked = !!e.unsafeWindow);
        this.updateSectionVisibility();
        if (this.elements.resourceList && e.resources && Array.isArray(e.resources)) {
            this.elements.resourceList.innerHTML = '';
            e.resources.forEach(e => this.ui.addResourceToList(e.name, e.url))
        } else this.elements.resourceList && (this.elements.resourceList.innerHTML = '');
        if (this.elements.requireList && Array.isArray(e.requires)) {
            this.elements.requireList.innerHTML = '';
            e.requires.forEach(e => this.ui.addRequireToList(e))
        } else this.elements.requireList && (this.elements.requireList.innerHTML = '')
    }
    gatherScriptData() {
        const e = Array.from(document.querySelectorAll('.url-item')).map(e => e.dataset.url),
            t = this.elements.targetUrl.value.trim();
        t && !e.includes(t) && e.push(t);
        const s = {
            name: this.elements.scriptName.value.trim(),
            author: this.elements.scriptAuthor.value.trim() || 'Anonymous',
            targetUrls: e,
            runAt: this.elements.runAt.value,
            version: this.elements.scriptVersion.value.trim() || this.config.DEFAULT_VERSION,
            description: this.elements.scriptDescription.value.trim(),
            license: this.elements.scriptLicense?.value.trim() || '',
            icon: this.elements.scriptIcon?.value.trim() || '',
            code: this.codeEditorManager.getValue(),
            enabled: !0,
            updatedAt: new Date().toISOString()
        };
        s.gmSetValue = this.elements.gmSetValue?.checked || !1;
        s.gmGetValue = this.elements.gmGetValue?.checked || !1;
        s.gmDeleteValue = this.elements.gmDeleteValue?.checked || !1;
        s.gmListValues = this.elements.gmListValues?.checked || !1;
        s.gmOpenInTab = this.elements.gmOpenInTab?.checked || !1;
        s.gmNotification = this.elements.gmNotification?.checked || !1;
        s.gmGetResourceText = this.elements.gmGetResourceText?.checked || !1;
        s.gmGetResourceURL = this.elements.gmGetResourceURL?.checked || !1;
        s.gmSetClipboard = this.elements.gmSetClipboard?.checked || !1;
        s.gmAddStyle = this.elements.gmAddStyle?.checked || !1;
        s.gmAddElement = this.elements.gmAddElement?.checked || !1;
        s.gmRegisterMenuCommand = this.elements.gmRegisterMenuCommand?.checked || !1;
        s.gmXmlhttpRequest = this.elements.gmXmlhttpRequest?.checked || !1;
        s.unsafeWindow = this.elements.unsafeWindow?.checked || !1;
        s.resources = [];
        if (this.elements.resourceList) {
            Array.from(this.elements.resourceList.querySelectorAll('.resource-item')).forEach(e => {
                s.resources.push({
                    name: e.dataset.name,
                    url: e.dataset.url
                })
            })
        }
        s.requires = [];
        if (this.elements.requireList) {
            Array.from(this.elements.requireList.querySelectorAll('.require-item')).forEach(e => {
                s.requires.push(e.dataset.url)
            })
        }
        return s
    }
    async saveScript(e = !1) {
        try {
            if (!this.validator.validateForm()) return null;
            const t = this.gatherScriptData();
            (!t.name || t.name.trim() === '') && (t.name = `Untitled Script ${new Date().toISOString().slice(0,10)}`);
            const s = !this.state.scriptId;
            if (!this.state.hasUnsavedChanges && !s) return null;
            if (t.resources && t.resources.length > 0) {
                t.resourceContents = {};
                await Promise.all(t.resources.map(async e => {
                    try {
                        const s = await fetch(e.url);
                        s.ok ? t.resourceContents[e.name] = await s.text() : (console.error(`Failed to fetch resource '${e.name}' from ${e.url}: ${s.status} ${s.statusText}`), t.resourceContents[e.name] = null)
                    } catch (s) {
                        console.error(`Error fetching resource '${e.name}':`, s);
                        t.resourceContents[e.name] = null
                    }
                }))
            }
            const i = await this.storage.saveScript(t, this.state.scriptId, this.state.isEditMode);
            this.state.scriptId = i.id;
            this.state.hasUnsavedChanges = !1;
            this.ui.updateScriptStatus(!1);
            if (s) {
                const e = new URL(window.location);
                e.searchParams.set('id', i.id);
                window.history.pushState({}, '', e);
                this.state.isEditMode = !0
            }
            this.notifyBackgroundScript();
            e || this.ui.showStatusMessage(`Script ${s?'created':'saved'} successfully`, 'success');
            setTimeout(() => {
                this.state.hasUnsavedChanges || this.ui.clearStatusMessage()
            }, 3e3);
            return i
        } catch (t) {
            console.error('Error saving script:', t);
            const s = t.message || 'Unknown error occurred';
            this.ui.showStatusMessage(`Failed to save script: ${s}`, 'error');
            setTimeout(() => {
                this.state.hasUnsavedChanges ? this.ui.showStatusMessage('Unsaved changes', 'warning') : this.ui.clearStatusMessage()
            }, 5e3);
            throw t
        }
    }
    updateEditorStateAfterSave(e) {
        if (!this.state.isEditMode) {
            this.state.isEditMode = !0;
            this.state.scriptId = e.id;
            window.history.replaceState({}, '', `../editor/editor.html?id=${e.id}`)
        }
    }
    async notifyBackgroundScript() {
        try {
            await new Promise(e => {
                chrome.runtime.sendMessage({
                    action: 'scriptsUpdated'
                }, () => {
                    chrome.runtime.lastError && console.warn('Background sync warning:', chrome.runtime.lastError);
                    e()
                })
            })
        } catch (e) {
            console.warn('Background sync warning:', e)
        }
    }
    setupBackgroundConnection() {
        try {
            const e = chrome.runtime.connect({
                name: 'CodeTweak'
            });
            e.onDisconnect.addListener(() => {
                console.log('Background connection closed, will reconnect when needed')
            })
        } catch (e) {
            console.warn('Initial background connection failed:', e)
        }
    }
    updateApiCount() {
        const e = Object.values(this.gmApiDefinitions).map(e => this.elements[e.el]).filter(e => e && e.checked).length;
        this.elements.apiCountBadge && (this.elements.apiCountBadge.textContent = e, this.elements.apiCountBadge.style.display = e > 0 ? 'inline' : 'none')
    }
    exportScript() {
        try {
            const e = this.gatherScriptData(),
                t = buildTampermonkeyMetadata(e),
                s = `${t}\n\n${e.code}`,
                i = ((e.name || 'script').replace(/[^a-z0-9_-]+/gi, '_').replace(/_{2,}/g, '_').replace(/^_|_$/g, '') || 'script'),
                a = new Blob([s], {
                    type: 'text/javascript;charset=utf-8'
                }),
                r = URL.createObjectURL(a),
                l = document.createElement('a');
            l.href = r;
            l.download = `${i}.user.js`;
            document.body.appendChild(l);
            l.click();
            document.body.removeChild(l);
            URL.revokeObjectURL(r);
            this.ui.showStatusMessage('Script exported', 'success')
        } catch (e) {
            console.error('Export failed:', e);
            this.ui.showStatusMessage('Export failed', 'error')
        }
    }
    generateTampermonkeyHeader() {
        try {
            const e = this.gatherScriptData(),
                t = buildTampermonkeyMetadata(e),
                s = this.codeEditorManager.getValue(),
                i = s.match(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/);
            let a;
            if (i) {
                a = s.replace(i[0], t);
                this.ui.showStatusMessage('Metadata updated', 'success')
            } else {
                a = t + '\n\n' + s;
                this.ui.showStatusMessage('Metadata generated', 'success')
            }
            this.codeEditorManager.setValue(a);
            this.markAsDirty()
        } catch (e) {
            console.error('Generate header failed:', e);
            this.ui.showStatusMessage('Failed to generate header', 'error')
        }
    }
}
document.addEventListener('DOMContentLoaded', () => {
    applyThemeFromSettings().then(() => {
        new ScriptEditor().init().catch(e => {
            console.error('Failed to initialize script editor:', e)
        })
    });
    chrome.runtime.onMessage.addListener(e => {
        e.action === 'settingsUpdated' && applyThemeFromSettings()
    })
});
async function applyThemeFromSettings() {
    try {
        const {
            settings: e = {}
        } = await chrome.storage.local.get('settings'), t = e.darkMode !== !1;
        document.body.classList.toggle('light-theme', !t)
    } catch (e) {
        console.error('Error applying theme:', e)
    }
}

function setupHelpModalTabs() {
    const e = document.querySelectorAll('.help-tab'),
        t = document.querySelectorAll('.help-tab-content');
    if (!e.length || !t.length) return;
    e.forEach(s => {
        s.addEventListener('click', function() {
            e.forEach(e => e.classList.remove('active'));
            t.forEach(e => e.classList.remove('active'));
            s.classList.add('active');
            const i = s.getAttribute('data-tab'),
                a = document.getElementById('help-tab-' + i);
            a && a.classList.add('active')
        })
    })
}
document.addEventListener('DOMContentLoaded', () => {
    setupHelpModalTabs();
    feather.replace()
});