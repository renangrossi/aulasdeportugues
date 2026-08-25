/*!
 * Renan, o Professor — Busca de palavras no dicionário
 * Reescreve todo link de dicionário/sinônimos/conjugação da página
 * para apontar para a palavra que o aluno digitou, inteiramente no
 * navegador — sem chamadas a nenhuma API.
 */
(function () {
  "use strict";

  var input = document.querySelector("[data-dict-word]");
  if (!input) return;
  var cards = document.querySelectorAll(".dict-card[data-url-template]");

  function update() {
    var raw = input.value.trim();
    var word = raw || "casa";
    var encoded = encodeURIComponent(word.toLowerCase());
    cards.forEach(function (card) {
      var tmpl = card.getAttribute("data-url-template");
      var link = card.querySelector("[data-dict-link]");
      if (!link) return;
      link.href = tmpl.replace("{word}", encoded);
      link.textContent = "";
      var icon = link.querySelector("svg");
      if (icon) link.appendChild(icon);
      link.appendChild(document.createTextNode(raw ? "Buscar “" + raw + "”" : "Buscar"));
    });
  }

  input.addEventListener("input", update);
  update();

  // Enter abre, em nova aba, um dos quatro dicionários principais, ao acaso
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      var primaryLinks = document.querySelectorAll(".card--feature.dict-card [data-dict-link]");
      if (!primaryLinks.length) return;
      var pick = primaryLinks[Math.floor(Math.random() * primaryLinks.length)];
      recordDictionaryUse();
      window.open(pick.href, "_blank", "noopener");
    }
  });

  // Qualquer clique em um link "Buscar" é um uso real do dicionário —
  // ver docs/gamification.md, conquistas "sherlock" / "dictionary_power_user".
  function recordDictionaryUse() {
    if (window.ProgressTracker && typeof window.ProgressTracker.recordDictionaryUse === "function") {
      window.ProgressTracker.recordDictionaryUse();
    }
  }
  document.querySelectorAll(".dict-card[data-url-template] [data-dict-link]").forEach(function (link) {
    link.addEventListener("click", recordDictionaryUse);
  });
})();
