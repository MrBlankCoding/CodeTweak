let isSelecting = false;
let currentElement = null;
let menu = null;
let selectorIndicator = null;

const TEMPLATES = {
  hide: (selector) => `
// Hide element
document.querySelector('${selector}')?.style.setProperty('display', 'none', 'important');`,

  remove: (selector) => `
// Remove element
document.querySelector('${selector}')?.remove();`,

  click: (selector) => `
// Click element
document.querySelector('${selector}')?.click();`,

  observe: (selector) => `
// Watch for element changes
const observer = new MutationObserver((mutations) => {
  const element = document.querySelector('${selector}');
  if (element) {
    // Your code here when element changes
    console.log('Element changed:', element);
  }
});

const target = document.querySelector('${selector}');
if (target) {
  observer.observe(target, {
    attributes: true,
    childList: true,
    characterData: true
  });
}`,
};

function generateSelector(element) {
  if (!element) return "";

  // Try ID first
  if (element.id) {
    return `#${element.id}`;
  }

  // Try unique classes
  if (element.className) {
    const classes = element.className
      .split(" ")
      .filter((c) => c && document.querySelectorAll(`.${c}`).length === 1);
    if (classes.length > 0) {
      return `.${classes[0]}`;
    }
  }

  // Generate path
  let path = [];
  let current = element;
  while (current.parentNode) {
    let selector = current.tagName.toLowerCase();
    if (current.parentNode.children.length > 1) {
      const index =
        Array.from(current.parentNode.children).indexOf(current) + 1;
      selector += `:nth-child(${index})`;
    }
    path.unshift(selector);
    current = current.parentNode;
    if (current === document.body) break;
  }

  return path.join(" > ");
}

function createMenu(x, y) {
  cleanup(false); // Cleanup but keep menu

  menu = document.createElement("div");
  menu.className = "scripty-menu";
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  const actions = [
    { icon: "🚫", text: "Hide Element", action: "hide" },
    { icon: "❌", text: "Remove Element", action: "remove" },
    { icon: "👆", text: "Click Element", action: "click" },
    { icon: "👀", text: "Watch Changes", action: "observe" },
  ];

  actions.forEach(({ icon, text, action }) => {
    const item = document.createElement("div");
    item.className = "scripty-menu-item";
    item.innerHTML = `<span class="scripty-menu-item-icon">${icon}</span>${text}`;
    item.addEventListener("click", () => handleAction(action));
    menu.appendChild(item);
  });

  document.body.appendChild(menu);

  // Add click outside handler
  setTimeout(() => {
    document.addEventListener("click", handleClickOutside);
  }, 0);
}

function handleClickOutside(e) {
  if (menu && !menu.contains(e.target)) {
    cleanup();
    document.removeEventListener("click", handleClickOutside);
  }
}

function handleAction(action) {
  const selector = generateSelector(currentElement);
  const template = TEMPLATES[action](selector);

  chrome.runtime.sendMessage({
    action: "createScript",
    data: {
      selector,
      template,
      url: window.location.href,
    },
  });

  cleanup();
}

function cleanup(removeMenu = true) {
  isSelecting = false;
  if (currentElement) {
    currentElement.classList.remove("scripty-highlight");
    currentElement = null;
  }
  if (removeMenu && menu) {
    menu.remove();
    menu = null;
  }
  if (selectorIndicator) {
    selectorIndicator.remove();
    selectorIndicator = null;
  }
}

function showSelectorMode() {
  const indicator = document.createElement("div");
  indicator.className = "scripty-selector-mode";
  indicator.innerHTML = `
    <span class="icon">🎯</span>
    <span>Selection Mode - Click an element to select it (Esc to cancel)</span>
  `;
  document.body.appendChild(indicator);
  return indicator;
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "startSelection") {
    isSelecting = true;
    selectorIndicator = showSelectorMode();
  }
});

document.addEventListener("mouseover", (e) => {
  if (!isSelecting) return;

  if (currentElement) {
    currentElement.classList.remove("scripty-highlight");
  }
  currentElement = e.target;
  currentElement.classList.add("scripty-highlight");

  e.stopPropagation();
});

document.addEventListener("click", (e) => {
  if (!isSelecting) return;

  e.preventDefault();
  e.stopPropagation();

  const x = e.clientX;
  const y = e.clientY;

  // Store selected element before disabling selection
  const selectedElement = currentElement;
  isSelecting = false; // Disable selection mode when menu opens

  // Create menu and restore current element for the action
  createMenu(x, y);
  currentElement = selectedElement;
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && isSelecting) {
    cleanup();
  }
});
