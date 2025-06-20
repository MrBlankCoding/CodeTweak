/**
  * CodeTweak Element Selector
 */

let isSelecting = false;
let currentElement = null;
let menu = null;
let selectorIndicator = null;

const TEMPLATES = {
  hide: (selector) =>
    `document.querySelector('${selector}')?.style.setProperty('display', 'none', 'important');`,

  remove: (selector) => `document.querySelector('${selector}')?.remove();`,

  click: (selector) => `document.querySelector('${selector}')?.click();`,

  observe: (selector) => `const observer = new MutationObserver((mutations) => {
  const element = document.querySelector('${selector}');
  if (element) {
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
  if (element.id) {
    return `#${CSS.escape(element.id)}`;
  }
  if (element.className && typeof element.className === "string") {
    const classes = element.className
      .split(" ")
      .filter(
        (c) => c && document.querySelectorAll(`.${CSS.escape(c)}`).length === 1
      );
    if (classes.length > 0) {
      return `.${CSS.escape(classes[0])}`;
    }
  }

  const path = [];
  let current = element;

  while (current && current.parentNode) {
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
  cleanup(false);

  menu = document.createElement("div");
  menu.className = "CodeTweak-menu";
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
    item.className = "CodeTweak-menu-item";
    item.innerHTML = `<span class="CodeTweak-menu-item-icon">${icon}</span>${text}`;
    item.addEventListener("click", () => handleAction(action));
    menu.appendChild(item);
  });

  document.body.appendChild(menu);

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
    currentElement.classList.remove("CodeTweak-highlight");
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
  indicator.className = "CodeTweak-selector-mode";
  indicator.innerHTML = `
    <span class="icon">🎯</span>
    <span>Selection Mode - Click an element to select it (Esc to cancel)</span>
  `;
  document.body.appendChild(indicator);
  return indicator;
}

// Event Listeners
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "startSelection") {
    isSelecting = true;
    selectorIndicator = showSelectorMode();
  }
});

document.addEventListener("mouseover", (e) => {
  if (!isSelecting) return;

  if (currentElement) {
    currentElement.classList.remove("CodeTweak-highlight");
  }
  currentElement = e.target;
  currentElement.classList.add("CodeTweak-highlight");

  e.stopPropagation();
});

document.addEventListener("click", (e) => {
  if (!isSelecting) return;

  e.preventDefault();
  e.stopPropagation();

  const x = e.clientX;
  const y = e.clientY;

  const selectedElement = currentElement;
  isSelecting = false;

  createMenu(x, y);
  currentElement = selectedElement;
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && isSelecting) {
    cleanup();
  }
});
