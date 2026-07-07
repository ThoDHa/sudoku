// Report portal theme toggle. Copied to <reports>/app.js by gen_report_portal.py.
// Cycles the root data-theme: unset (OS) -> opposite of OS -> light -> dark -> ...
(function () {
  "use strict";
  var btn = document.getElementById("themeBtn");
  if (!btn) return;
  var root = document.documentElement;
  btn.addEventListener("click", function () {
    var current = root.getAttribute("data-theme");
    var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    var next = current === "dark" ? "light"
      : current === "light" ? "dark"
      : prefersDark ? "light" : "dark";
    root.setAttribute("data-theme", next);
  });
})();
