import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UIManager } from '../../src/ai_dom_editor/editor/helpers/ui_manager.js';

describe('UIManager', () => {
  let uiManager;
  let mockEditor;

  beforeEach(() => {
    vi.restoreAllMocks();

    mockEditor = {
      elements: {
        configBanner: document.createElement('div'),
        chatContainer: document.createElement('div'),
        messages: document.createElement('div'),
        selectorActive: document.createElement('div'),
        elementSelectorBtn: document.createElement('button'),
        welcomeMessage: document.createElement('div'),
      },
      currentScript: null,
      userscriptHandler: {
        updateUserscript: vi.fn(),
        createUserscript: vi.fn(),
        getAllScripts: vi.fn().mockResolvedValue([]),
      },
      chatManager: {
        addMessage: vi.fn(),
        scrollToBottom: vi.fn(),
      },
    };

    global.chrome = {
      runtime: {
        getURL: vi.fn((path) => `chrome-extension://id/${path}`),
        sendMessage: vi.fn(),
      },
      tabs: {
        query: vi.fn(),
      },
    };

    uiManager = new UIManager(mockEditor);
  });

  describe('show/hideConfigBanner', () => {
    it('should toggle display property', () => {
      uiManager.showConfigBanner();
      expect(mockEditor.elements.configBanner.style.display).toBe('flex');
      uiManager.hideConfigBanner();
      expect(mockEditor.elements.configBanner.style.display).toBe('none');
    });
  });

  describe('createMessageElement', () => {
    it('should create a user message', () => {
      const el = uiManager.createMessageElement('user', 'hello');
      expect(el.className).toContain('ai-message-user');
      expect(el.textContent).toContain('hello');
    });

    it('should create an assistant text message', () => {
      const el = uiManager.createMessageElement('assistant', 'hi', { type: 'text' });
      expect(el.className).toContain('ai-message-assistant');
      expect(el.textContent).toContain('hi');
    });

    it('should create an assistant code message', () => {
      const data = { type: 'code', code: 'console.log(1)', name: 'Test', explanation: 'exp' };
      const el = uiManager.createMessageElement('assistant', '', data);
      expect(el.querySelector('.ai-code-block')).not.toBeNull();
      expect(el.textContent).toContain('exp');
    });

    it('should create an assistant patch message', () => {
      const data = {
        type: 'patch',
        patches: [{ type: 'unified', diff: 'diff' }],
        name: 'Test',
        explanation: 'exp',
      };
      const el = uiManager.createMessageElement('assistant', '', data);
      expect(el.querySelector('.ai-diff-container')).not.toBeNull();
      expect(el.textContent).toContain('exp');
    });
  });

  describe('createCodePreview', () => {
    it('should create element with code and title', () => {
      const el = uiManager.createCodePreview('code', 'My Script');
      expect(el.className).toContain('ai-code-response');
      expect(el.querySelector('.ai-code-title').textContent).toContain('My Script');
      expect(el.querySelector('.ai-code-block').textContent).toBe('code');
    });

    it('should show Update button if currentScript exists', () => {
      mockEditor.currentScript = { id: 's1', name: 'Existing' };
      const el = uiManager.createCodePreview('code', 'New');
      const applyBtn = el.querySelector('.ai-code-btn.primary');
      expect(applyBtn.textContent).toContain('Update');
    });

    it('should show Create button if no currentScript', () => {
      mockEditor.currentScript = null;
      const el = uiManager.createCodePreview('code', 'New');
      const applyBtn = el.querySelector('.ai-code-btn.primary');
      expect(applyBtn.textContent).toContain('Create');
    });
  });

  describe('updateAllActionButtons', () => {
    it('should update multiple buttons correctly', () => {
      document.body.innerHTML = `
        <div class="ai-code-actions">
          <button class="ai-code-btn primary action-btn">Old</button>
        </div>
      `;
      mockEditor.currentScript = { name: 'S1' };
      uiManager.updateAllActionButtons();
      const btn = document.querySelector('.action-btn');
      expect(btn.textContent).toContain('Update');
    });
  });

  describe('createMessageElement errors', () => {
    it('should render error data message', () => {
      const el = uiManager.createMessageElement('assistant', 'bad error', { error: true });
      expect(el.textContent).toContain('Error');
      expect(el.textContent).toContain('bad error');
    });
  });

  describe('createPatchPreview', () => {
    it('should create element with patch items', () => {
      const patches = [{ type: 'unified', diff: '@@ -1 +1 @@\n-old\n+new' }];
      const el = uiManager.createPatchPreview(patches);
      expect(el.className).toContain('ai-patch-response');
      expect(el.querySelectorAll('.ai-patch-preview')).toHaveLength(1);
    });
  });

  describe('autoResize', () => {
    it('should adjust textarea height', () => {
      const textarea = document.createElement('textarea');
      Object.defineProperty(textarea, 'scrollHeight', { value: 100 });
      uiManager.autoResize(textarea);
      expect(textarea.style.height).toBe('100px');
    });

    it('should limit height to 120px', () => {
      const textarea = document.createElement('textarea');
      Object.defineProperty(textarea, 'scrollHeight', { value: 200 });
      uiManager.autoResize(textarea);
      expect(textarea.style.height).toBe('120px');
    });
  });

  describe('showWelcomeMessage/hideWelcomeMessage', () => {
    it('should toggle welcome message visibility', () => {
      uiManager.showWelcomeMessage();
      expect(mockEditor.elements.welcomeMessage.style.display).toBe('block');

      uiManager.hideWelcomeMessage();
      expect(mockEditor.elements.welcomeMessage.style.display).toBe('none');
    });
  });

  describe('scrollToBottom', () => {
    it('should scroll messages container to bottom', () => {
      uiManager.scrollToBottom();
      // Should set scrollTop to scrollHeight
      expect(mockEditor.elements.chatContainer).toBeDefined();
    });
  });

  describe('showScriptSelector', () => {
    beforeEach(() => {
      document.body.innerHTML = '<input id="userInput" />';
    });

    it('should show script selector when scripts exist', async () => {
      mockEditor.userscriptHandler.getAllScripts.mockResolvedValue([{ name: 'S1' }]);
      const input = document.getElementById('userInput');
      await uiManager.showScriptSelector(input);
      const dropdown = document.querySelector('.script-selector');
      expect(dropdown).toBeTruthy();
    });
  });

  describe('addLoadingMessage', () => {
    it('should add loading message to chat', () => {
      const messageId = uiManager.addLoadingMessage();
      expect(messageId).toBeTruthy();
      expect(mockEditor.elements.messages.children.length).toBeGreaterThan(0);
    });
  });

  describe('_createFeatherIcon', () => {
    it('should create feather icon element', () => {
      const icon = uiManager._createFeatherIcon('home', 16);
      expect(icon.tagName).toBe('I');
      expect(icon.getAttribute('data-feather')).toBe('home');
      expect(icon.getAttribute('width')).toBe('16');
    });
  });

  describe('_createUserTextElement', () => {
    it('should create user text element', () => {
      const text = 'Hello world';
      const el = uiManager._createUserTextElement(text);
      expect(el.tagName).toBe('DIV');
      expect(el.className).toContain('ai-message-text');
      expect(el.textContent).toBe('Hello world');
    });
  });
});
