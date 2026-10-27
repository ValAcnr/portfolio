// Bascule clair / sombre. Le choix est mémorisé si le navigateur le permet ;
// sinon la page suit simplement le réglage du système.
(function () {
  var root = document.documentElement;
  try {
    var saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") root.setAttribute("data-theme", saved);
  } catch (e) {}

  function effectif() {
    var t = root.getAttribute("data-theme");
    if (t) return t;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  document.addEventListener("DOMContentLoaded", function () {
    var btn = document.querySelector(".theme-btn");
    if (!btn) return;
    function libelle() {
      btn.setAttribute("aria-label", effectif() === "dark" ? "Passer en thème clair" : "Passer en thème sombre");
    }
    libelle();
    btn.addEventListener("click", function () {
      var next = effectif() === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("theme", next); } catch (e) {}
      libelle();
    });
  });
})();
