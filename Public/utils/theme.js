function initDarkMode() {
  const darkModeToggle = document.getElementById("darkModeToggle");
  const prefersDarkScheme = window.matchMedia("(prefers-color-scheme: dark)");

  const getCurrentTheme = () => {
    const savedTheme = localStorage.getItem("theme");
    return savedTheme || (prefersDarkScheme.matches ? "dark" : "light");
  };

  const setTheme = (theme) => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
    if (darkModeToggle) {
      darkModeToggle.innerHTML = theme === "dark" ? "☀️" : "🌙";
    }
  };

  setTheme(getCurrentTheme());
  if (darkModeToggle) {
    darkModeToggle.addEventListener("click", () => {
      const currentTheme = getCurrentTheme();
      setTheme(currentTheme === "dark" ? "light" : "dark");
    });
  }
  prefersDarkScheme.addEventListener("change", (e) => {
    setTheme(e.matches ? "dark" : "light");
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { initDarkMode };
} else {
  window.initDarkMode = initDarkMode;
}
