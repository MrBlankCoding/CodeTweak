/* global feather */
import {
    generateUrlMatchPattern
} from "../utils/urlMatchPattern.js";
class BaseUIComponent {
    constructor(e, t) {
        this.elements = e, this.eventBus = t, this.eventListeners = []
    }
    addEventListener(e, t, s, i = {}) {
        e && (e.addEventListener(t, s, i), this.eventListeners.push({
            element: e,
            event: t,
            handler: s
        }))
    }
    destroy() {
        this.eventListeners.forEach(({
            element: e,
            event: t,
            handler: s
        }) => {
            e.removeEventListener(t, s)
        }), this.eventListeners = []
    }
    emit(e, t = {}) {
        this.eventBus.emit(e, t)
    }
    on(e, t) {
        this.eventBus.on(e, t)
    }
}
export class ModalManager extends BaseUIComponent {
    constructor(e, t) {
        super(e, t), this.setupEventListeners()
    }
    setupEventListeners() {
        this.elements.settingsBtn && (this.addEventListener(this.elements.settingsBtn, "click", () => {
            this.showModal("settings")
        }), this.addEventListener(this.elements.closeSettings, "click", () => {
            this.hideModal("settings")
        })), this.elements.helpButton && (this.addEventListener(this.elements.helpButton, "click", e => {
            e.stopPropagation(), this.hideModal("settings"), setTimeout(() => this.showModal("help"), 200)
        }), this.addEventListener(document.querySelector(".close-help-modal"), "click", e => {
            e.stopPropagation(), this.hideModal("help")
        })), this.addEventListener(document, "click", e => {
            if (e.target.classList.contains("modal") && e.target.classList.contains("show")) {
                const t = e.target.id.replace("Modal", "");
                this.hideModal(t)
            }
        }), this.addEventListener(document, "keydown", e => {
            if ("Escape" === e.key) {
                const e = document.querySelector(".modal.show");
                if (e) {
                    const t = e.id.replace("Modal", "");
                    this.hideModal(t)
                }
            }
        })
    }
    showModal(e) {
        const t = document.getElementById(`${e}Modal`);
        if (t) {
            document.body.style.overflow = "hidden", t.classList.add("show"), t.style.display = "flex", document.body.classList.add("modal-open");
            const s = t.querySelector("button, [href], input, select, textarea, [tabindex]:not([tabindex=\"-1\"])");
            s && s.focus(), this.emit("modalOpened", {
                type: e
            })
        }
    }
    hideModal(e) {
        const t = document.getElementById(`${e}Modal`);
        if (t && t.classList.contains("show")) {
            document.querySelectorAll(".modal.show").length <= 1 && (document.body.style.overflow = "", document.body.classList.remove("modal-open")), t.classList.remove("show"), setTimeout(() => {
                t.style.display = "none"
            }, 200), this.emit("modalClosed", {
                type: e
            })
        }
    }
}
export class SidebarManager extends BaseUIComponent {
    constructor(e, t, s) {
        super(e, t), this.config = s, this.setupEventListeners()
    }
    setupEventListeners() {
        this.addEventListener(window, "resize", () => {
            this.handleResize()
        })
    }
    handleResize() {
        setTimeout(() => {
            this.emit("layoutChanged")
        }, 100)
    }
}
export class StatusManager extends BaseUIComponent {
    constructor(e, t) {
        super(e, t), this.setupEventListeners()
    }
    setupEventListeners() {
        this.on("scriptStatusChanged", ({
            hasUnsavedChanges: e
        }) => {
            this.updateScriptStatus(e)
        })
    }
    updateScriptStatus(e) {
        const t = this.elements.scriptStatusBadge;
        t && (e ? (t.textContent = "Unsaved Changes", t.style.backgroundColor = "#4B5563", t.style.color = "#D1D5DB") : (t.textContent = "Saved", t.style.backgroundColor = "#065F46", t.style.color = "#A7F3D0"))
    }
    showMessage(e, t = "success", s = 3e3) {
        const {
            statusMessage: i
        } = this.elements;
        i && (i.textContent = e, i.className = `status-message ${t}`, i.style.display = "block", s > 0 && setTimeout(() => this.clearMessage(), s))
    }
    clearMessage() {
        const {
            statusMessage: e
        } = this.elements;
        e && (e.textContent = "", e.className = "status-message", e.style.display = "none")
    }
    showError(e) {
        this.showMessage(e, "error", 5e3)
    }
    showSuccess(e) {
        this.showMessage(e, "success", 3e3)
    }
}
export class SettingsManager extends BaseUIComponent {
    constructor(e, t) {
        super(e, t), this.settingsInputs = this.getSettingsInputs(), this.setupEventListeners()
    }
    getSettingsInputs() {
        return {
            fontSize: document.getElementById("fontSize"),
            tabSize: document.getElementById("tabSize"),
            lineNumbers: document.getElementById("lineNumbers"),
            lineWrapping: document.getElementById("lineWrapping"),
            matchBrackets: document.getElementById("matchBrackets"),
            minimap: document.getElementById("minimap"),
            lintingEnabled: document.getElementById("lintingEnabled"),
            autosaveEnabled: document.getElementById("autosaveEnabled")
        }
    }
    setupEventListeners() {
        this.setupInstantApplyListeners(), this.setupModalListeners(), this.setupActionButtons()
    }
    setupInstantApplyListeners() {
        const {
            settingsInputs: e
        } = this;
        e.fontSize && this.addEventListener(e.fontSize, "input", () => {
            const t = parseInt(e.fontSize.value, 10),
                s = document.getElementById("fontSizeValue");
            s && (s.textContent = t + "px"), this.emit("settingChanged", {
                fontSize: t
            })
        }), e.tabSize && this.addEventListener(e.tabSize, "input", () => {
            this.emit("settingChanged", {
                tabSize: parseInt(e.tabSize.value, 10)
            })
        }), ["lineNumbers", "lineWrapping", "matchBrackets", "minimap"].forEach(t => {
            e[t] && this.addEventListener(e[t], "change", () => {
                this.emit("settingChanged", {
                    [t]: e[t].checked
                })
            })
        }), e.lintingEnabled && this.addEventListener(e.lintingEnabled, "change", () => {
            const t = e.lintingEnabled.checked;
            localStorage.setItem("lintingEnabled", t.toString()), this.emit("lintingToggled", {
                enabled: t
            })
        }), e.autosaveEnabled && this.addEventListener(e.autosaveEnabled, "change", () => {
            const t = e.autosaveEnabled.checked;
            localStorage.setItem("autosaveEnabled", t.toString()), this.emit("autosaveToggled", {
                enabled: t
            })
        })
    }
    setupModalListeners() {
        this.on("modalOpened", ({
            type: e
        }) => {
            "settings" === e && this.loadSettingsIntoModal()
        })
    }
    setupActionButtons() {
        const e = document.getElementById("saveSettings"),
            t = document.getElementById("resetSettings"),
            s = document.querySelector("#settingsModal .close");
        e && this.addEventListener(e, "click", async e => {
            e.preventDefault(), e.stopPropagation(), await this.saveAllSettings()
        }), t && this.addEventListener(t, "click", e => {
            e.preventDefault(), this.resetToDefaults()
        }), s && this.addEventListener(s, "click", e => {
            e.preventDefault();
            const t = document.getElementById("settingsModal");
            t && (t.classList.remove("show"), t.style.display = "none", document.body.style.overflow = "")
        })
    }
    async loadSettingsIntoModal() {
        try {
            const e = await this.loadSettings(),
                {
                    settingsInputs: t
                } = this;
            if (t.fontSize && void 0 !== e.fontSize) {
                t.fontSize.value = e.fontSize;
                const s = document.getElementById("fontSizeValue");
                s && (s.textContent = e.fontSize + "px")
            }
            t.tabSize && void 0 !== e.tabSize && (t.tabSize.value = e.tabSize), t.lineNumbers && void 0 !== e.lineNumbers && (t.lineNumbers.checked = !!e.lineNumbers), t.lineWrapping && void 0 !== e.lineWrapping && (t.lineWrapping.checked = !!e.lineWrapping), t.matchBrackets && void 0 !== e.matchBrackets && (t.matchBrackets.checked = !!e.matchBrackets), t.minimap && void 0 !== e.minimap && (t.minimap.checked = !!e.minimap), t.lintingEnabled && (t.lintingEnabled.checked = "true" === localStorage.getItem("lintingEnabled")), t.autosaveEnabled && (t.autosaveEnabled.checked = "true" === localStorage.getItem("autosaveEnabled"))
        } catch (e) {
            console.error("Failed to load settings:", e)
        }
    }
    async loadSettings() {
        try {
            return (await chrome.storage.local.get(["editorSettings"])).editorSettings || {}
        } catch (e) {
            return console.error("Failed to load settings from storage:", e), {}
        }
    }
    async saveAllSettings() {
        try {
            const {
                settingsInputs: e
            } = this, t = {
                fontSize: parseInt(e.fontSize?.value, 10) || 14,
                tabSize: parseInt(e.tabSize?.value, 10) || 2,
                lineNumbers: !!e.lineNumbers?.checked,
                lineWrapping: !!e.lineWrapping?.checked,
                matchBrackets: !!e.matchBrackets?.checked,
                minimap: !!e.minimap?.checked
            };
            await chrome.storage.local.set({
                editorSettings: t
            }), this.emit("settingsSaved", t), this.emit("settingChanged", t), this.emit("showStatus", {
                message: "Settings saved successfully",
                type: "success"
            });
            const s = document.getElementById("settingsModal");
            return s && (s.classList.remove("show"), s.style.display = "none", document.body.style.overflow = ""), !0
        } catch (e) {
            return console.error("Failed to save settings:", e), this.emit("showStatus", {
                message: "Failed to save settings: " + (e.message || "Unknown error"),
                type: "error"
            }), !1
        }
    }
    resetToDefaults() {
        const {
            settingsInputs: e
        } = this;
        if (e.fontSize) {
            e.fontSize.value = 14;
            const t = document.getElementById("fontSizeValue");
            t && (t.textContent = "14px")
        }
        e.tabSize && (e.tabSize.value = 2), e.lineNumbers && (e.lineNumbers.checked = !0), e.lineWrapping && (e.lineWrapping.checked = !1), e.matchBrackets && (e.matchBrackets.checked = !0), e.minimap && (e.minimap.checked = !0), e.lintingEnabled && (e.lintingEnabled.checked = !0), e.autosaveEnabled && (e.autosaveEnabled.checked = !0), localStorage.setItem("lintingEnabled", "true"), localStorage.setItem("autosaveEnabled", "true"), this.emit("settingsReset", {
            fontSize: 14,
            tabSize: 2,
            lineNumbers: !0,
            lineWrapping: !1,
            matchBrackets: !0,
            minimap: !0
        })
    }
}
export class URLManager extends BaseUIComponent {
    constructor(e, t) {
        super(e, t), this.statusManager = e.statusManager || e.status, this.setupEventListeners()
    }
    setupEventListeners() {
        this.elements.addUrlBtn && this.addEventListener(this.elements.addUrlBtn, "click", e => {
            e.preventDefault(), this.addCurrentUrl()
        }), this.elements.urlList && this.addEventListener(this.elements.urlList, "click", e => {
            e.target.closest(".remove-btn") && (e.preventDefault(), this.removeUrl(e.target.closest(".url-item")))
        }), this.elements.targetUrl && this.addEventListener(this.elements.targetUrl, "keypress", e => {
            "Enter" === e.key && (e.preventDefault(), this.addCurrentUrl())
        }), this.elements.generatePatternBtn && this.elements.generatePatternBtn.addEventListener("click", () => {
            const e = this.elements.patternBaseUrl.value.trim(),
                t = this.elements.patternScope.value,
                s = generateUrlMatchPattern(e, t);
            s && (this.elements.generatedPattern.value = s + ("exact" === t ? "" : ""), this.elements.generatedPatternGroup.classList.remove("hidden"))
        }), this.elements.insertPatternBtn && this.elements.insertPatternBtn.addEventListener("click", () => {
            const e = this.elements.generatedPattern.value.trim();
            e && (this.addUrlToList(e), this.elements.generatedPatternGroup.classList.add("hidden"), this.elements.patternBaseUrl.value = "")
        })
    }
    addCurrentUrl() {
        const e = this.elements.targetUrl?.value?.trim();
        if (!e) return void(this.statusManager && this.statusManager.showError("URL cannot be empty."));
        this.isValidUrl(e) ? (this.addUrlToList(e), this.elements.targetUrl.value = "", this.emit("urlAdded", {
            url: e
        })) : this.statusManager && this.statusManager.showError("Invalid URL pattern.")
    }
    addUrlToList(e) {
        if (this.elements.urlList && Array.from(this.elements.urlList.querySelectorAll(".url-item")).some(t => t.dataset.url === e)) return !1;
        try {
            const t = document.createElement("div");
            if (t.className = "url-item", t.dataset.url = e, t.innerHTML = `<span>${this.escapeHtml(e)}</span><button type="button" class="remove-btn" title="Remove URL"><i data-feather="x"></i></button>`, this.elements.urlList) return this.elements.urlList.appendChild(t), this.emit("sidebarChanged"), feather.replace(), !0
        } catch (e) {
            console.error("Error adding URL to list:", e)
        }
        return !1
    }
    removeUrl(e) {
        if (!e) return;
        const t = e.dataset?.url;
        e.remove ? e.remove() : e.parentNode && e.parentNode.removeChild(e), t && (this.emit("urlRemoved", {
            url: t
        }), this.emit("sidebarChanged"))
    }
    getUrls() {
        return Array.from(this.elements.urlList.querySelectorAll(".url-item")).map(e => e.dataset.url)
    }
    isValidUrl(e) {
        try {
            if (!e.match(/^https?:\/\//i)) return this.statusManager && this.statusManager.showError("Please enter a valid URL in this format: https://example.com (include http:// or https://)"), !1;
            return new URL(e), !0
        } catch {
            return this.statusManager && this.statusManager.showError("Please enter a valid URL in this format: https://example.com (include http:// or https://)"), !1
        }
    }
    escapeHtml(e) {
        const t = document.createElement("div");
        return t.textContent = e, t.innerHTML
    }
}
export class RequireManager extends BaseUIComponent {
    constructor(e, t) {
        super(e, t), this.callbacks = {}, this.setupEventListeners()
    }
    setupEventListeners() {
        this.elements.addRequireBtn && this.addEventListener(this.elements.addRequireBtn, "click", () => {
            this.addCurrentRequire()
        }), this.elements.requireList && this.addEventListener(this.elements.requireList, "click", e => {
            e.target.classList.contains("remove-require-btn") && this.removeRequire(e.target.closest(".require-item"))
        })
    }
    addCurrentRequire() {
        const e = this.elements.requireURL.value.trim();
        e && (this.addRequireToList(e), this.elements.requireURL.value = "", this.emit("requireAdded", {
            url: e
        }))
    }
    addRequireToList(e) {
        if (!e) return;
        const t = document.createElement("li");
        t.className = "require-item", t.dataset.url = e, t.innerHTML = `<span>${this.escapeHtml(e)}</span><button class="remove-require-btn" title="Remove Required Script">×</button>`, this.elements.requireList.appendChild(t), this.emit("requireAdded", {
            url: e
        }), this.emit("sidebarChanged"), this.callbacks.updateSectionVisibility && this.callbacks.updateSectionVisibility()
    }
    removeRequire(e) {
        const t = e.dataset.url;
        e.remove(), this.emit("requireRemoved", {
            url: t
        }), this.emit("sidebarChanged"), this.callbacks.updateSectionVisibility && this.callbacks.updateSectionVisibility()
    }
    getRequires() {
        return Array.from(this.elements.requireList.querySelectorAll(".require-item")).map(e => e.dataset.url)
    }
    escapeHtml(e) {
        const t = document.createElement("div");
        return t.textContent = e, t.innerHTML
    }
}
export class ResourceManager extends BaseUIComponent {
    constructor(e, t) {
        super(e, t), this.callbacks = {}, this.setupEventListeners()
    }
    setupEventListeners() {
        this.addEventListener(this.elements.addResourceBtn, "click", () => {
            this.addCurrentResource()
        }), this.addEventListener(this.elements.resourceList, "click", e => {
            const t = e.target.closest(".remove-resource-btn, .remove-resource");
            t && this.removeResource(t.closest(".resource-item"))
        }), this.on("gmApiChanged", ({
            api: e
        }) => {
            "GM_getResourceText" !== e && "GM_getResourceURL" !== e || this.toggleResourceSection()
        })
    }
    addCurrentResource() {
        const e = this.elements.resourceName.value.trim(),
            t = this.elements.resourceURL.value.trim();
        e && t && (this.addResourceToList(e, t), this.elements.resourceName.value = "", this.elements.resourceURL.value = "", this.emit("resourceAdded", {
            name: e,
            url: t
        }))
    }
    addResourceToList(e, t) {
        if (!e || !t) return;
        const s = document.createElement("li");
        s.className = "resource-item", s.dataset.name = e, s.dataset.url = t, s.innerHTML = `<span>${this.escapeHtml(e)} (${this.escapeHtml(t)})</span><button class="remove-resource" title="Remove Resource">×</button>`, this.elements.resourceList.appendChild(s), this.emit("resourceAdded", {
            name: e,
            url: t
        }), this.emit("sidebarChanged"), this.callbacks.updateSectionVisibility && this.callbacks.updateSectionVisibility()
    }
    removeResource(e) {
        const t = e.dataset.name,
            s = e.dataset.url;
        e.remove(), this.emit("resourceRemoved", {
            name: t,
            url: s
        }), this.emit("sidebarChanged"), this.callbacks.updateSectionVisibility && this.callbacks.updateSectionVisibility()
    }
    toggleResourceSection() {
        const e = document.getElementById("resourcesSection"),
            t = this.elements.gmGetResourceText?.checked || this.elements.gmGetResourceURL?.checked;
        e && e.classList.toggle("hidden", !t)
    }
    getResources() {
        return Array.from(this.elements.resourceList.querySelectorAll(".resource-item")).map(e => ({
            name: e.dataset.name,
            url: e.dataset.url
        }))
    }
    escapeHtml(e) {
        const t = document.createElement("div");
        return t.textContent = e, t.innerHTML
    }
}
export class FormManager extends BaseUIComponent {
    constructor(e, t) {
        super(e, t), this.setupEventListeners()
    }
    setupEventListeners() {
        ["scriptName", "scriptAuthor", "scriptVersion", "scriptDescription", "runAt", "waitForSelector", "scriptResources"].forEach(e => {
            const t = this.elements[e];
            if (t) {
                const e = "checkbox" === t.type ? "change" : "input";
                this.addEventListener(t, e, () => {
                    this.emit("formChanged")
                })
            }
        })
    }
    getFormData() {
        return {
            name: this.elements.scriptName?.value?.trim() || "",
            author: this.elements.scriptAuthor?.value?.trim() || "",
            version: this.elements.scriptVersion?.value?.trim() || "1.0",
            description: this.elements.scriptDescription?.value?.trim() || "",
            runAt: this.elements.runAt?.value || "document-end",
            waitForSelector: this.elements.waitForSelector?.value?.trim() || ""
        }
    }
    setFormData(e) {
        this.elements.scriptName && (this.elements.scriptName.value = e.name || ""), this.elements.scriptAuthor && (this.elements.scriptAuthor.value = e.author || ""), this.elements.scriptVersion && (this.elements.scriptVersion.value = e.version || "1.0"), this.elements.scriptDescription && (this.elements.scriptDescription.value = e.description || ""), this.elements.runAt && (this.elements.runAt.value = e.runAt || "document-end"), this.elements.waitForSelector && (this.elements.waitForSelector.value = e.waitForSelector || "")
    }
    validate() {
        const e = [];
        return this.getFormData().name || e.push("Script name is required"), {
            isValid: 0 === e.length,
            errors: e
        }
    }
}
export class UIManager {
    constructor(e, t) {
        this.elements = e, this.config = t, this.eventBus = new EventBus, this.components = {}, this.hasUnsavedChanges = !1, this.initializeComponents(), this.setupGlobalEventListeners(), this.setupButtonEventListeners()
    }
    initializeComponents() {
        this.components.modal = new ModalManager({
            settingsBtn: this.elements.settingsBtn,
            closeSettings: this.elements.closeSettings,
            settingsModal: this.elements.settingsModal,
            helpButton: document.getElementById("helpButton")
        }, this.eventBus), this.components.sidebar = new SidebarManager(this.elements, this.eventBus, this.config), this.components.status = new StatusManager(this.elements, this.eventBus), this.components.settings = new SettingsManager(this.elements, this.eventBus), this.components.url = new URLManager(this.elements, this.eventBus), this.components.resource = new ResourceManager(this.elements, this.eventBus), this.components.require = new RequireManager(this.elements, this.eventBus), this.components.form = new FormManager(this.elements, this.eventBus), this.components.url && this.components.status && (this.components.url.statusManager = this.components.status)
    }
    setupGlobalEventListeners() {
        let e = !1;
        const t = () => {
            e = !0
        };
        document.addEventListener("mousedown", t, {
            once: !0
        }), document.addEventListener("keydown", t, {
            once: !0
        }), window.addEventListener("beforeunload", t => {
            if (this.hasUnsavedChanges && e) return t.preventDefault(), t.returnValue = "You have unsaved changes. Are you sure you want to leave?", t.returnValue
        })
    }
    setupButtonEventListeners() {
        this.components.form && "function" == typeof this.components.form.setupEventListeners && this.components.form.setupEventListeners()
    }
    setupFormEventListeners(e) {
        this.components.form && "function" == typeof this.components.form.setupEventListeners && this.components.form.setupEventListeners(e)
    }
    setupUrlManagement(e) {
        this.components.url && "function" == typeof this.components.url.setupUrlManagement && this.components.url.setupUrlManagement(e)
    }
    setupSettingsModal(e) {
        this.components.settings && "function" == typeof this.components.settings.setupModalListeners && this.components.settings.setupModalListeners(e)
    }
    setupResourceManagement(e) {
        this.components.resource && (this.components.resource.callbacks = e || {}, "function" == typeof this.components.resource.setupEventListeners && this.components.resource.setupEventListeners(e)), this.components.require && (this.components.require.callbacks = e || {})
    }
    on(e, t) {
        this.eventBus.on(e, t)
    }
    emit(e, t) {
        this.eventBus.emit(e, t)
    }
    addResourceToList(e, t) {
        this.components.resource && "function" == typeof this.components.resource.addResourceToList ? this.components.resource.addResourceToList(e, t) : console.warn("ResourceManager not properly initialized")
    }
    addRequireToList(e) {
        this.components.require && "function" == typeof this.components.require.addRequireToList && this.components.require.addRequireToList(e)
    }
    getComponent(e) {
        return this.components[e]
    }
    destroy() {
        Object.values(this.components).forEach(e => {
            e.destroy && e.destroy()
        })
    }
    updateScriptStatus(e) {
        this.hasUnsavedChanges = e, this.components.status && "function" == typeof this.components.status.updateScriptStatus && this.components.status.updateScriptStatus(e)
    }
    showStatusMessage(e, t = "success", s = 3e3) {
        this.components.status && "function" == typeof this.components.status.showMessage && this.components.status.showMessage(e, t, s)
    }
    clearStatusMessage() {
        this.components.status && "function" == typeof this.components.status.clearMessage && this.components.status.clearMessage()
    }
    initializeCollapsibleSections() {
        this.components.sidebar && "function" == typeof this.components.sidebar.initializeCollapsibleSections && this.components.sidebar.initializeCollapsibleSections()
    }
    addUrlToList(e) {
        this.components.url && "function" == typeof this.components.url.addUrlToList && this.components.url.addUrlToList(e)
    }
    updateSidebarState() {
        this.components.sidebar && "function" == typeof this.components.sidebar.updateVisibility && this.components.sidebar.updateVisibility()
    }
}
class EventBus {
    constructor() {
        this.events = new Map
    }
    on(e, t) {
        this.events.has(e) || this.events.set(e, []), this.events.get(e).push(t)
    }
    off(e, t) {
        if (this.events.has(e)) {
            const s = this.events.get(e).indexOf(t);
            s > -1 && this.events.get(e).splice(s, 1)
        }
    }
    emit(e, t = {}) {
        this.events.has(e) && this.events.get(e).forEach(e => {
            try {
                e(t)
            } catch (t) {
                console.error(`Error in event handler for ${e}:`, t)
            }
        })
    }
}
export class StorageManager {
    constructor() {
        this.storageKey = "scripts"
    }
    async getScript(e) {
        try {
            const {
                [this.storageKey]: t = []
            } = await chrome.storage.local.get(this.storageKey);
            return t.find(t => t.id === e) || null
        } catch (e) {
            return console.error("Failed to get script:", e), null
        }
    }
    async saveScript(e, t = null, s = !1) {
        try {
            const {
                [this.storageKey]: i = []
            } = await chrome.storage.local.get(this.storageKey), n = (new Date).toISOString();
            if (s && t) {
                const s = i.findIndex(e => e.id === t);
                if (-1 === s) throw new Error("Script not found for editing");
                const r = i[s],
                    o = {
                        ...e,
                        id: t,
                        createdAt: r.createdAt || n,
                        updatedAt: n
                    };
                return i[s] = o, await chrome.storage.local.set({
                    [this.storageKey]: i
                }), o
            } {
                const t = {
                    ...e,
                    id: this.generateUniqueId(),
                    createdAt: n,
                    updatedAt: n
                };
                return i.push(t), await chrome.storage.local.set({
                    [this.storageKey]: i
                }), t
            }
        } catch (e) {
            throw console.error("Failed to save script:", e), e
        }
    }
    async deleteScript(e) {
        try {
            const {
                [this.storageKey]: t = []
            } = await chrome.storage.local.get(this.storageKey), s = t.filter(t => t.id !== e);
            return await chrome.storage.local.set({
                [this.storageKey]: s
            }), !0
        } catch (e) {
            return console.error("Failed to delete script:", e), !1
        }
    }
    async getAllScripts() {
        try {
            return (await chrome.storage.local.get(this.storageKey))[this.storageKey] || []
        } catch (e) {
            return console.error("Failed to get all scripts:", e), []
        }
    }
    generateUniqueId() {
        return `${Date.now().toString(36)}${Math.random().toString(36).substring(2)}`
    }
}
export class FormValidator {
    constructor(e) {
        this.elements = e
    }
    validateForm() {
        return [this.validateTargetUrls(), this.validateVersion(), this.validateRunAt(), this.validateIconUrl(), this.validateRequireUrls(), this.validateResources()].every(e => e.isValid)
    }
    validateTargetUrls() {
        const e = Array.from(document.querySelectorAll(".url-item")).map(e => e.dataset.url),
            t = this.elements.targetUrl.value.trim();
        if (0 === e.length && !t) return this.showValidationError("Please add at least one target URL."), {
            isValid: !1
        };
        if (t) try {
            new URL(t)
        } catch {
            return this.showValidationError("The target URL must be a valid http(s) URL."), {
                isValid: !1
            }
        }
        return {
            isValid: !0
        }
    }
    validateVersion() {
        const e = this.elements.scriptVersion,
            t = (e?.value || "").trim();
        return t && !/^\d+\.\d+\.\d+$/.test(t) ? (this.showValidationError("Version must be in the format X.Y.Z (e.g., 1.0.0)."), {
            isValid: !1
        }) : {
            isValid: !0
        }
    }
    validateRunAt() {
        const e = new Set(["document_start", "document_end", "document_idle"]),
            t = this.elements.runAt?.value;
        return t && !e.has(t) ? (this.showValidationError("Invalid 'Run at' value selected."), {
            isValid: !1
        }) : {
            isValid: !0
        }
    }
    validateIconUrl() {
        const e = this.elements.scriptIcon?.value?.trim();
        if (!e) return {
            isValid: !0
        };
        try {
            const t = new URL(e);
            return "http:" !== t.protocol && "https:" !== t.protocol ? (this.showValidationError("Icon URL must start with http:// or https://"), {
                isValid: !1
            }) : {
                isValid: !0
            }
        } catch {
            return this.showValidationError("Icon URL is not a valid URL."), {
                isValid: !1
            }
        }
    }
    validateRequireUrls() {
        const e = Array.from(document.querySelectorAll(".require-item"));
        for (const t of e) {
            const e = t.dataset.url?.trim();
            if (!e) return this.showValidationError("A required script entry is missing its URL."), {
                isValid: !1
            };
            try {
                new URL(e)
            } catch {
                return this.showValidationError("One of the required script URLs is invalid."), {
                    isValid: !1
                }
            }
        }
        return {
            isValid: !0
        }
    }
    validateResources() {
        const e = Array.from(document.querySelectorAll(".resource-item"));
        for (const t of e) {
            const e = t.dataset.name?.trim(),
                s = t.dataset.url?.trim();
            if (!e) return this.showValidationError("A resource is missing its name."), {
                isValid: !1
            };
            if (!s) return this.showValidationError("A resource is missing its URL."), {
                isValid: !1
            };
            try {
                new URL(s)
            } catch {
                return this.showValidationError("One of the resource URLs is invalid."), {
                    isValid: !1
                }
            }
        }
        return {
            isValid: !0
        }
    }
    showValidationError(e) {
        const t = this.elements.statusMessage;
        t.textContent = e, t.className = "status-message error", t.style.display = "block"
    }
}