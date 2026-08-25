/*!
 * Renan, o Professor — Verbos Irregulares (verbos-irregulares.html)
 * Melhoria progressiva apenas: a tabela completa já está no HTML
 * estático da página (funciona sem JS, é indexável e imprimível).
 * Isto só adiciona filtragem em tempo real, no navegador, conforme o
 * aluno digita.
 */
(function () {
  "use strict";

  var input = document.querySelector("[data-verb-filter]");
  var tbody = document.querySelector("[data-verb-tbody]");
  if (!input || !tbody) return;

  var countNotice = document.querySelector("[data-verb-count]");
  var emptyNotice = document.querySelector("[data-verb-empty]");
  var emptyTerm = document.querySelector("[data-verb-empty-term]");
  var rows = Array.prototype.slice.call(tbody.querySelectorAll("tr"));
  var total = rows.length;

  function filter() {
    var q = input.value.trim().toLowerCase();
    var shown = 0;
    rows.forEach(function (row) {
      var match = !q || row.textContent.toLowerCase().indexOf(q) !== -1;
      row.hidden = !match;
      if (match) shown++;
    });

    if (emptyNotice) emptyNotice.hidden = shown !== 0;
    if (emptyTerm) emptyTerm.textContent = input.value.trim();
    if (countNotice) {
      countNotice.hidden = shown === 0;
      var label = countNotice.querySelector("span") || countNotice;
      var text = q
        ? "Mostrando " + shown + " de " + total + " verbos com “" + input.value.trim() + "”."
        : "Mostrando todos os " + total + " verbos.";
      // O primeiro nó de texto guarda a mensagem; o ícone <svg> no início permanece.
      var textNode = Array.prototype.find.call(countNotice.childNodes, function (n) { return n.nodeType === 3; });
      if (textNode) textNode.textContent = text;
    }
  }

  var debounceTimer;
  input.addEventListener("input", function () {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(filter, 80);
  });
})();
