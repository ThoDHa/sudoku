// Report portal theming. Copied to <reports>/app.js by gen_report_portal.py.
// The portal is same-origin as the game, so it reads the game's saved theme
// (localStorage: colorTheme, modePreference) and mirrors it. themes.css holds
// the token values per [data-color-theme][data-mode]; here we just stamp those
// attributes on :root. The mode toggle writes back to the same key, so changing
// it here also changes the game.
(function () {
  "use strict";
  var root = document.documentElement;
  var VALID = ["tokyonight", "dracula", "nord", "catppuccin", "gruvbox", "rosepine", "solarized", "onedark"];
  var LABEL = { light: "☀ light", dark: "☾ dark", system: "◐ system" };

  function systemMode() {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function apply() {
    var theme = localStorage.getItem("colorTheme");
    if (VALID.indexOf(theme) === -1) theme = "tokyonight";
    var pref = localStorage.getItem("modePreference");
    if (["light", "dark", "system"].indexOf(pref) === -1) pref = "system";
    root.setAttribute("data-color-theme", theme);
    root.setAttribute("data-mode", pref === "system" ? systemMode() : pref);
    var btn = document.getElementById("themeBtn");
    if (btn) btn.textContent = LABEL[pref];
  }

  apply();

  var btn = document.getElementById("themeBtn");
  if (btn) {
    btn.addEventListener("click", function () {
      var pref = localStorage.getItem("modePreference");
      var next = pref === "light" ? "dark" : pref === "dark" ? "system" : "light";
      localStorage.setItem("modePreference", next);
      apply();
    });
  }

  // Re-apply when the OS preference flips (while in system mode) or when the
  // game changes the theme in another tab.
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", apply);
  window.addEventListener("storage", apply);
})();
