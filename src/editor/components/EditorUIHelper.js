export class EditorUIHelper {
  constructor(editor) {
    this.editor = editor;
  }

  updateIconPreview() {
    const { elements } = this.editor;
    const url = elements.scriptIcon.value;
    const preview = elements.iconPreview;
    if (url) {
      preview.src = url;
      preview.style.display = 'block';
    } else {
      preview.style.display = 'none';
    }
  }

  setupSidebarIconHandlers() {
    const { elements } = this.editor;
    const { sidebar, sidebarIconBtns, sidebarPanels, sidebarContentArea } = elements;
    if (!sidebarIconBtns) return;

    sidebar.classList.remove('expanded', 'has-active-panel');
    sidebarIconBtns.forEach((btn) => btn.classList.remove('active'));
    sidebarPanels.forEach((panel) => panel.classList.remove('active'));
    sidebarContentArea.style.display = 'none';

    sidebarIconBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const section = btn.getAttribute('data-section');
        const panel = document.getElementById(`${section}-panel`);
        if (!panel) return;

        const isCurrentlyActive = btn.classList.contains('active');

        if (isCurrentlyActive) {
          sidebar.classList.remove('expanded', 'has-active-panel');
          btn.classList.remove('active');
          panel.classList.remove('active');
          sidebarContentArea.style.display = 'none';
          sidebarContentArea.style.width = '0';
        } else {
          sidebar.classList.add('has-active-panel', 'expanded');
          sidebarIconBtns.forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          sidebarPanels.forEach((p) => p.classList.remove('active'));
          panel.classList.add('active');
          sidebarContentArea.style.display = 'flex';
          sidebarContentArea.style.width = '280px';
        }
      });
    });
  }

  updateSectionVisibility() {
    const { elements } = this.editor;
    const section = document.getElementById('resourcesSection');
    const shouldShow = elements.gmGetResourceText?.checked || elements.gmGetResourceURL?.checked;
    if (section) section.classList.toggle('hidden', !shouldShow);

    const requiresSection = document.getElementById('requiresSection');
    if (requiresSection) requiresSection.classList.remove('hidden');
  }

  setupResourceApiListeners() {
    const { elements } = this.editor;
    [elements.gmGetResourceText, elements.gmGetResourceURL].forEach((checkbox) => {
      checkbox?.addEventListener('change', () => this.updateSectionVisibility());
    });
  }
}
