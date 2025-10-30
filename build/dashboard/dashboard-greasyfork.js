import { parseUserScriptMetadata } from "../utils/metadataParser.js";
import { showNotification } from "./dashboard-ui.js";
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

  elements.results.textContent = "";
  elements.loading.style.display = "block";

  try {
    const encodedQuery = encodeURIComponent(query);
    // Using the search API endpoint with proper parameters
    const response = await fetch(
      `https://greasyfork.org/en/scripts?q=${encodedQuery}&sort=updated`, 
      {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        credentials: 'same-origin' // Important for CORS
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Greasy Fork API error:', errorText);
      throw new Error(`HTTP error ${response.status}: ${errorText}`);
    }

    const scripts = await response.json();
    console.log('Search results:', scripts); // Debug log
    
    elements.results.textContent = ""; // Clear previous results

    if (!scripts || scripts.length === 0) {
      const div = document.createElement("div");
      div.className = "no-results";
      div.textContent = `No scripts found for "${query}". Try a different search term.`;
      elements.results.appendChild(div);
    } else {
      for (const script of scripts) {
        const card = createScriptCard(script);
        elements.results.appendChild(card);
      }
    }

    elements.results
      .querySelectorAll(".import-greasy-fork")
      .forEach((button) => {
        button.addEventListener("click", () => {
          const codeUrl = button.closest(".script-card").dataset.codeUrl;
          importGreasyforkScript(codeUrl);
        });
      });
  } catch (error) {
    console.error("Error searching Greasy Fork:", error);
    const errorDiv = document.createElement("div");
    errorDiv.className = "error-message";
    errorDiv.textContent = `Error searching Greasy Fork: ${error.message}. Please try again later.`;
    elements.results.appendChild(errorDiv);
  } finally {
    elements.loading.style.display = "none";
  }
}

function createScriptCard(script) {
  const formatNumber = (num) => (num ? num.toLocaleString() : "0");

  const card = document.createElement("div");
  card.className = "script-card";
  card.dataset.codeUrl = script.code_url;

  const title = document.createElement("h3");
  title.textContent = script.name;
  card.appendChild(title);

  const meta = document.createElement("div");
  meta.className = "script-card-meta";
  meta.innerHTML = `
    <span>👤 ${formatNumber(script.total_installs)}</span>
    <span>👍 ${formatNumber(script.good_ratings)}</span>
    <span>v${script.version || "1.0.0"}</span>
  `;
  card.appendChild(meta);

  const description = document.createElement("p");
  description.className = "script-card-description";
  description.textContent = script.description || "";
  card.appendChild(description);

  const actions = document.createElement("div");
  actions.className = "script-card-actions";

  const viewLink = document.createElement("a");
  viewLink.href = script.url;
  viewLink.target = "_blank";
  viewLink.rel = "noopener noreferrer";
  viewLink.className = "secondary";
  viewLink.textContent = "View on Greasy Fork";
  actions.appendChild(viewLink);

  const importBtn = document.createElement("button");
  importBtn.className = "primary import-greasy-fork";
  importBtn.textContent = "Import";
  actions.appendChild(importBtn);

  card.appendChild(actions);
  return card;
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
