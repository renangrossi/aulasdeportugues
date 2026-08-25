/*!
 * Renan, o Professor — Today's Review (today-review.html)
 * ------------------------------------------------------------------
 * Reads assets/js/mastery.js's due-item queue, looks each item up in
 * the generated assets/data/exercise-items-index.json (see
 * scripts/build_exercise_index.py), groups them into fresh
 * exercise-data blocks by level + exercise type, and hands them to the
 * same rendering/grading engine every lesson page already uses
 * (window.ExerciseEngine, exposed by assets/js/exercises.js) --
 * nothing here re-implements grading.
 *
 * Caps a single day's session at MAX_ITEMS_PER_SESSION, most-overdue
 * first, so "review" stays a small daily habit instead of an
 * ever-growing backlog dumped on the student at once -- the rest
 * stays queued for the next visit (dueAt doesn't change just because
 * an item wasn't shown today).
 * ------------------------------------------------------------------ */
(function () {
  "use strict";

  var MAX_ITEMS_PER_SESSION = 20;
  var TYPE_LABELS = {
    "fill-blank": "Complete as Lacunas",
    "multiple-choice": "Múltipla Escolha",
    "correction": "Correção de Erros",
    "typing": "Reescrever / Resposta Curta",
    "matching": "Associação",
    "ordering": "Ordem das Palavras",
    "true-false": "Verdadeiro ou Falso",
    "vocabulary": "Vocabulário",
    "reading-comprehension": "Compreensão de Leitura",
  };

  function el(tag, attrs, html) {
    var node = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      if (k === "class") node.className = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    if (html != null) node.innerHTML = html;
    return node;
  }

  function renderStatus(box, dueCount, shownCount, byLevel) {
    box.innerHTML = "";
    if (dueCount === 0) {
      box.className = "notice";
      box.appendChild(el("p", {}, "<strong>Você está em dia!</strong> Não há nada para revisar agora. Continue estudando suas lições, e os itens vão aparecer aqui exatamente na hora certa de revisá-los."));
      return;
    }
    var levelSummary = Object.keys(byLevel)
      .sort()
      .map(function (lvl) { return lvl + " (" + byLevel[lvl] + ")"; })
      .join(", ");
    var overflowNote = dueCount > shownCount
      ? " Mais " + (dueCount - shownCount) + " ite" + (dueCount - shownCount === 1 ? "m" : "ns") + " vão aparecer na sua próxima visita -- a sessão de hoje é limitada para manter a revisão leve."
      : "";
    box.appendChild(el("p", {}, "<strong>" + shownCount + " ite" + (shownCount === 1 ? "m" : "ns") + " para revisar hoje</strong> (" + levelSummary + ")." + overflowNote));
  }

  function groupKey(level, type) { return level + "::" + type; }

  function buildExerciseData(groupId, level, type, items) {
    return {
      id: groupId,
      type: type,
      title: (TYPE_LABELS[type] || type) + " — Revisão " + level,
      instructions: "Revisão combinada, reunida de várias lições de " + level + " que você já estudou.",
      items: items,
    };
  }

  function main() {
    var statusBox = document.getElementById("review-status-box");
    var blocksWrap = document.getElementById("review-blocks");
    if (!statusBox || !blocksWrap) return;

    if (!window.MasteryTracker) {
      statusBox.innerHTML = "<p>O acompanhamento de revisão não está disponível agora.</p>";
      return;
    }

    var dueIds = window.MasteryTracker.getDueItemIds();

    fetch("assets/data/exercise-items-index.json")
      .then(function (r) { return r.json(); })
      .then(function (index) {
        // Most-overdue first: sort by each item's dueAt (earlier = more overdue).
        var withMastery = dueIds
          .filter(function (id) { return index[id]; }) // drop ids not in the index (e.g. A1, hand-authored pre-pipeline)
          .map(function (id) {
            var m = window.MasteryTracker.getItemMastery(id);
            return { id: id, dueAt: (m && m.dueAt) || "9999-99-99" };
          })
          .sort(function (a, b) { return a.dueAt < b.dueAt ? -1 : a.dueAt > b.dueAt ? 1 : 0; });

        var shown = withMastery.slice(0, MAX_ITEMS_PER_SESSION);
        var byLevel = {};
        var groups = {}; // groupKey -> items[]
        var groupOrder = [];

        shown.forEach(function (entry) {
          var item = index[entry.id];
          byLevel[item.level] = (byLevel[item.level] || 0) + 1;
          var key = groupKey(item.level, item.exerciseType);
          if (!groups[key]) { groups[key] = []; groupOrder.push(key); }
          // Strip the index's extra metadata fields before handing the
          // item to the exercise engine -- harmless either way (unknown
          // fields are ignored), but keeps the reconstructed block
          // identical in shape to a hand-authored exercise-data item.
          var clean = {};
          Object.keys(item).forEach(function (k) {
            if (["exerciseType", "exerciseId", "exerciseTitle", "exerciseInstructions", "lessonId", "lessonTitle", "level", "lessonUrl"].indexOf(k) === -1) {
              clean[k] = item[k];
            }
          });
          groups[key].push(clean);
        });

        renderStatus(statusBox, dueIds.length, shown.length, byLevel);

        groupOrder.forEach(function (key, i) {
          var parts = key.split("::");
          var level = parts[0], type = parts[1];
          var data = buildExerciseData("review-" + i + "-" + key.replace(/[^a-z0-9]/gi, "-"), level, type, groups[key]);
          var container = el("div", { class: "exercise-block" });
          var script = document.createElement("script");
          script.type = "application/json";
          script.className = "exercise-data";
          script.textContent = JSON.stringify(data);
          container.appendChild(script);
          blocksWrap.appendChild(container);
        });

        if (window.ExerciseEngine && typeof window.ExerciseEngine.init === "function") {
          window.ExerciseEngine.init();
        }
      })
      .catch(function () {
        statusBox.innerHTML = "<p>Não foi possível carregar a fila de revisão agora. Tente novamente mais tarde.</p>";
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }
})();
