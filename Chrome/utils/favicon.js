function getFaviconUrl(domain) {
  // Try multiple (might need a API for later)
  const services = [
    `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
    `https://${domain}/favicon.ico`,
    `https://${domain}/favicon.png`,
  ];

  return services[0]; // google default
}

function createFaviconElement(domain) {
  const img = document.createElement("img");
  img.src = getFaviconUrl(domain);
  img.className = "favicon";
  img.alt = `${domain} favicon`;

  // fallback
  img.onerror = function () {
    const fallback = document.createElement("div");
    fallback.className = "favicon-fallback";
    fallback.textContent = domain.charAt(0).toUpperCase();
    this.parentElement.replaceChild(fallback, this);
  };

  return img;
}
