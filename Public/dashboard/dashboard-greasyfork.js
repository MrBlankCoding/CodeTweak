import { parseUserScriptMetadata } from "../utils/metadataParser.js";

function setupGreasyfork(elements) {
  if (!elements.button) return;

  elements.button.addEventListener("click", () => {
    elements.modal.setAttribute("aria-hidden", "false");
    elements.modal.classList.add("show");
  });

  elements.closeBtn.addEventListener("click", () => {
    elements.modal.setAttribute("aria-hidden", "true");
    elements.modal.classList.remove("show");
  });

  elements.modal.addEventListener("click", (e) => {
    if (
      e.target === elements.modal ||
      e.target.classList.contains("modal-overlay")
    ) {
      elements.modal.setAttribute("aria-hidden", "true");
      elements.modal.classList.remove("show");
    }
  });

  elements.searchInput.addEventListener("keyup", (e) => {
    if (e.key === "Enter") {
      searchGreasyfork(elements);
    }
  });

  elements.searchBtn.addEventListener("click", () => {
    searchGreasyfork(elements);
  });
}

async function searchGreasyfork(elements) {
  const query = elements.searchInput.value.trim();
  if (!query) return;

  elements.results.innerHTML = "";
  elements.loading.style.display = "block";

  try {
    const encodedQuery = encodeURIComponent(query);
    const response = await fetch(
      `https://api.greasyfork.org/en/scripts.json?q=${encodedQuery}`
    );

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    const scripts = await response.json();

    if (scripts.length === 0) {
      elements.results.innerHTML = `
        <div class="no-results">
          No scripts found for "${escapeHtml(
            query
          )}". Try a different search term.
        </div>
      `;
    } else {
      elements.results.innerHTML = scripts
        .map((script) => createScriptCard(script))
        .join("");

      elements.results
        .querySelectorAll(".import-greasy-fork")
        .forEach((button) => {
          button.addEventListener("click", () => {
            const codeUrl = button.closest(".script-card").dataset.codeUrl;
            importGreasyforkScript(codeUrl);
          });
        });
    }
  } catch (error) {
    console.error("Error searching Greasy Fork:", error);
    elements.results.innerHTML = `
      <div class="error-message">
        Error searching Greasy Fork: ${error.message}. Please try again later.
      </div>
    `;
  } finally {
    elements.loading.style.display = "none";
  }
}

function createScriptCard(script) {
  const formatNumber = (num) => {
    return num ? num.toLocaleString() : "0";
  };

  return `
    <div class="script-card" data-code-url="${escapeHtml(script.code_url)}">
      <h3>${escapeHtml(script.name)}</h3>
      <div class="script-card-meta">
        <span>👤 ${formatNumber(script.total_installs)}</span>
        <span>👍 ${formatNumber(script.good_ratings)}</span>
        <span>v${script.version || "1.0.0"}</span>
      </div>
      <p class="script-card-description">${escapeHtml(
        script.description || ""
      )}</p>
      <div class="script-card-actions">
        <a href="${
          script.url
        }" target="_blank" rel="noopener noreferrer" class="secondary">
          View on Greasy Fork
        </a>
        <button class="primary import-greasy-fork">
          Import
        </button>
      </div>
    </div>
  `;
}

async function importGreasyforkScript(codeUrl) {
  if (!codeUrl) {
    showNotification("Invalid script URL", "error");
    return;
  }

  try {
    const response = await fetch(codeUrl);
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    const code = await response.text();

    // Parse the script metadata using our shared utility
    const metadata = parseUserScriptMetadata(code);

    if (!metadata || Object.keys(metadata).length === 0) {
      throw new Error("No valid metadata found in script");
    }

    const updateInfo = {
      source: "greasyfork",
      sourceUrl: codeUrl,
      updateUrl: metadata.updateURL || codeUrl,
      downloadUrl: metadata.downloadURL || codeUrl,
      version: metadata.version || "1.0.0",
      lastChecked: Date.now(),
    };

    const scriptData = {
      name: metadata.name || "Imported Script",
      author: metadata.author || "Anonymous",
      description: metadata.description || "",
      version: metadata.version || "1.0.0",
      targetUrls: metadata.matches || ["*://*/*"],
      code: code,
      runAt: metadata.runAt || "document_end",
      enabled: true,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      updateInfo,
      ...(metadata.resources && { resources: metadata.resources }),
      ...(metadata.requires && { requires: metadata.requires }),
      ...(metadata.license && { license: metadata.license }),
      ...(metadata.icon && { icon: metadata.icon }),
    };
    Object.keys(metadata.gmApis).forEach((apiFlag) => {
      scriptData[apiFlag] = metadata.gmApis[apiFlag];
    });

    try {
      const { scripts = [] } = await chrome.storage.local.get("scripts");
      scripts.push(scriptData);
      await chrome.storage.local.set({ scripts });

      showNotification("Script imported successfully", "success");
      chrome.runtime.sendMessage({ action: "scriptsUpdated" });

      const modal = document.getElementById("greasyforkModal");
      if (modal) {
        modal.setAttribute("aria-hidden", "true");
        modal.classList.remove("show");
      }

      // Refresh the dashboard by reloading the page
      window.location.reload();
    } catch (error) {
      console.error("Error saving script:", error);
      throw error;
    }
  } catch (error) {
    console.error("Error importing script:", error);
    showNotification("Error importing script: " + error.message, "error");
  }
}

export { setupGreasyfork };