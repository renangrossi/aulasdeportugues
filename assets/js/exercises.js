/*!
 * Renan, o Professor — Interactive Exercise Engine
 * ------------------------------------------------------------------
 * A small, dependency-free, data-driven engine for classroom-style
 * exercises. New exercises are added by editing a JSON block, not by
 * writing JavaScript — see any lesson page's
 * <script type="application/json" class="exercise-data"> block for
 * a live example of the format.
 *
 * Supported "type" values:
 *   multiple-choice, true-false, fill-blank, matching, ordering,
 *   correction, typing, reading-comprehension, vocabulary, writing
 *   ("writing" is self-check only, handled separately -- see the
 *   dedicated `data.type === "writing"` branches below rather than
 *   the `renderers` table used by every other type.)
 *
 * Contract
 * --------
 * Each `.exercise-block` element carries a child
 * <script type="application/json" class="exercise-data"> with a
 * single exercise definition (see SCHEMA below). On DOMContentLoaded
 * the engine finds every such pair, renders the questions, and wires
 * up Submit / Retry-incorrect behaviour. Nothing here talks to a
 * server — everything is graded in the browser, which is what keeps
 * this deployable as a static GitHub Pages site.
 *
 * SCHEMA (informal):
 * {
 *   "id": "unique-id",
 *   "type": "multiple-choice" | "true-false" | "fill-blank" | "matching"
 *         | "ordering" | "correction" | "typing" | "reading-comprehension"
 *         | "vocabulary",
 *   "title": "Exercise title",
 *   "instructions": "One line of instructions shown under the title.",
 *   "passage": "Optional HTML passage, used by reading-comprehension.",
 *   "items": [ ...type-specific items, see renderers below... ]
 * }
 *
 * Every item's "explanation" is shown after grading regardless of whether
 * the answer was correct — write it as a short rule/reason a student can
 * learn from, not just "Correct answer."
 *
 * fill-blank items render a <select> dropdown per blank when "options" is
 * given (see renderFillBlank below for the exact shape), and fall back to
 * a free-text <input> for any blank without options.
 */
(function () {
  "use strict";

  /* ------------------------------------------------------------- *
   * Utilities
   * ------------------------------------------------------------- */
  function norm(s) {
    return String(s || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[.!?]+$/g, "");
  }

  function matchesAny(value, accepted) {
    var list = Array.isArray(accepted) ? accepted : [accepted];
    var v = norm(value);
    return list.some(function (a) {
      return norm(a) === v;
    });
  }

  // Author-supplied item ids (e.g. "n5") are only meant to be unique
  // within one exercise block's JSON, but can repeat across topics on
  // the same page. Building radio "name"/element "id" attributes
  // straight from item.id therefore risks duplicate DOM ids: a
  // <label for> resolves to the *first* element in the document with
  // that id, so clicking an option could silently check/focus a
  // same-id control in a completely different, earlier exercise
  // instead of the one clicked. A monotonically increasing counter
  // guarantees every generated id is unique for the life of the page,
  // regardless of what item ids the JSON reuses.
  var uidCounter = 0;
  function uniqueId(base) {
    return "q_" + base + "_" + (uidCounter++);
  }

  function shuffled(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      if (k === "class") node.className = attrs[k];
      else if (k === "html") node.innerHTML = attrs[k];
      else if (k === "text") node.textContent = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) {
      if (c) node.appendChild(c);
    });
    return node;
  }

  function iconSpan(kind) {
    var d = kind === "check" ? '<path d="m5 12 5 5L20 7"/>' : '<path d="M18 6 6 18M6 6l12 12"/>';
    var wrap = el("span");
    wrap.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + "</svg>";
    return wrap.firstChild;
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  /* ------------------------------------------------------------- *
   * syncLiveFormState — the actual fix for the "Save my answers"
   * PDF/print bug.
   *
   * `container.cloneNode(true)` is used to build the printable
   * overlay (see performSaveAnswers below). Per the HTML Living
   * Standard, <input> and <textarea> have defined "cloning steps"
   * that copy their *current* value onto the clone, but <select>/
   * <option> have no such cloning steps at all — cloneNode() only
   * reproduces a <select>'s parsed/initial state, never whichever
   * <option> the user (or script) currently has selected. Since the
   * "matching" exercise type — and every "fill-blank" item that
   * supplies dropdown options — renders its answer controls as
   * <select> elements, the cloned printable overlay silently lost
   * every one of those answers while the rest of the page looked
   * fine.
   *
   * Fix: after cloning, walk the live source container and the
   * clone's form controls in lockstep (querySelectorAll order is
   * identical for two structurally-identical trees) and copy the
   * live value/checkedness across explicitly. This is done for
   * every control type, not just <select>, both as cheap insurance
   * against the exact same spec gap on any future/edge-case browser
   * and to keep one code path responsible for "make the print
   * overlay match what's on screen" rather than relying on
   * per-element browser behaviour.
   * ------------------------------------------------------------- */
  function syncLiveFormState(source, clone) {
    var sourceControls = source.querySelectorAll("input, select, textarea");
    var cloneControls = clone.querySelectorAll("input, select, textarea");
    sourceControls.forEach(function (src, i) {
      var dst = cloneControls[i];
      if (!dst) return;
      if (src.type === "checkbox" || src.type === "radio") {
        dst.checked = src.checked;
      } else {
        dst.value = src.value;
      }
    });
  }

  /* ------------------------------------------------------------- *
   * Shared save/print system — used by every "Save my answers" /
   * "Print / save my answers" button on the site (both graded
   * exercise blocks and free-text writing blocks), so a fix here
   * applies everywhere at once rather than per exercise type.
   *
   * Responsibilities:
   *   1. Preserve the learner's scroll position across the print
   *      dialog (hiding the rest of the page for printing changes
   *      document height, which otherwise resets scroll to 0).
   *   2. Give the generated PDF a meaningful, deterministic filename
   *      built from the page's level/section context plus the
   *      exercise's own type/title — never a generic "answers.pdf".
   * ------------------------------------------------------------- */
  var SECTION_LABELS = {
    exercises: "Exercícios",
    vocabulary: "Vocabulário",
    reading: "Leitura",
    listening: "Escuta",
    writing: "Escrita",
    speaking: "Fala",
    revision: "Revisão",
    "mock-tests": "Simulados",
  };
  var TYPE_LABELS = {
    "fill-blank": "complete as lacunas",
    "multiple-choice": "múltipla escolha",
    vocabulary: "vocabulário",
    "true-false": "verdadeiro ou falso",
    matching: "associação",
    ordering: "ordenação",
    correction: "correção",
    typing: "digitação",
    "reading-comprehension": "compreensão de leitura",
  };
  // Same labels as TYPE_LABELS, title-cased, for the printed/PDF
  // document header (buildExercisePrintHeaderText below) — kept as a
  // sibling lookup rather than title-casing TYPE_LABELS on the fly so
  // small words ("in", "the", "or") stay lowercase the way a real
  // document heading would write them ("Fill in the Blanks", not
  // "Fill In The Blanks").
  var TYPE_LABELS_TITLE = {
    "fill-blank": "Complete as Lacunas",
    "multiple-choice": "Múltipla Escolha",
    vocabulary: "Vocabulário",
    "true-false": "Verdadeiro ou Falso",
    matching: "Associação",
    ordering: "Ordenação",
    correction: "Correção",
    typing: "Digitação",
    "reading-comprehension": "Compreensão de Leitura",
    writing: "Escrita",
  };

  function sanitizeFilename(name) {
    return name
      .replace(/[\\/:*?"<>|]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  // The level/section/topic portion shared by the saved filename
  // (buildSaveFilename) and the printed document header
  // (buildExercisePrintHeaderText) — one place deriving "where this
  // exercise lives" so the two never disagree.
  function buildSavePathParts(container) {
    var levelCode = (document.body.getAttribute("data-level-code") || "").trim();
    var parts = [];
    if (levelCode) parts.push(levelCode);

    var sectionEl = container.closest("section[id]");
    if (sectionEl) {
      var id = sectionEl.id;
      if (SECTION_LABELS[id]) {
        parts.push(SECTION_LABELS[id]);
      } else {
        // On Test Yourself pages each grammar topic is its own
        // <section id="topic-slug">, so identify it by its own
        // heading text under the overarching "Test Yourself" label.
        var heading = sectionEl.querySelector("h2, h3");
        var topicTitle = heading ? heading.textContent.trim() : "";
        parts.push("Teste Você Mesmo");
        if (topicTitle) parts.push(topicTitle);
      }
    }
    return parts;
  }

  function buildSaveFilename(container, data) {
    var parts = buildSavePathParts(container);
    var last = "";
    if (data.type && data.type !== "writing" && TYPE_LABELS[data.type]) {
      last += TYPE_LABELS[data.type] + " ";
    }
    last += data.title || "Exercício";
    parts.push(last.trim());

    return sanitizeFilename(parts.join(" - "));
  }

  /* ------------------------------------------------------------- *
   * Printed document header — a visible heading inserted at the top
   * of every printable overlay (single exercise / topic / full test)
   * so the PDF itself states exactly what it contains, e.g.
   * "A2 - Test Yourself - Prepositions of Place and Movement -
   * Matching - Match the Preposition to Its Meaning". Reuses the same
   * level/topic detection as the filename above rather than deriving
   * it a second way, so the header and the saved filename always
   * describe the same document.
   * ------------------------------------------------------------- */
  function buildExercisePrintHeaderText(container, data) {
    var parts = buildSavePathParts(container);
    var typeLabel = TYPE_LABELS_TITLE[data.type];
    if (typeLabel) parts.push(typeLabel);
    parts.push(data.title || "Exercício");
    return parts.join(" - ");
  }

  function buildTopicPrintHeaderText(topicSection) {
    var levelCode = (document.body.getAttribute("data-level-code") || "").trim();
    var heading = topicSection.querySelector("h2, h3");
    var topicTitle = heading ? heading.textContent.trim() : (topicSection.id || "T\u00f3pico");
    var parts = [];
    if (levelCode) parts.push(levelCode);
    parts.push("Teste Você Mesmo");
    parts.push(topicTitle + " — Tópico");
    return parts.join(" - ");
  }

  function buildTestPrintHeaderText() {
    var levelCode = (document.body.getAttribute("data-level-code") || "").trim();
    var parts = [];
    if (levelCode) parts.push(levelCode);
    parts.push("Teste Você Mesmo — Completo");
    return parts.join(" - ");
  }

  function buildPrintHeaderNode(text) {
    return el("div", { class: "print-doc-header" }, [
      el("p", { class: "print-doc-header__path", text: text }),
    ]);
  }

  // Wraps `contentNode` with the print-only header above it — the one
  // insertion point every "Save…" flow below funnels through, so the
  // header can never be added on the interactive page by mistake.
  function wrapWithPrintHeader(headerText, contentNode) {
    var wrap = el("div", { class: "print-doc" });
    wrap.appendChild(buildPrintHeaderNode(headerText));
    wrap.appendChild(contentNode);
    return wrap;
  }

  function performSaveAnswers(container, data, buildOverlayContent) {
    var scrollX = window.scrollX;
    var scrollY = window.scrollY;
    var originalTitle = document.title;
    var restored = false;

    var overlay = document.getElementById("print-overlay");
    if (!overlay) {
      overlay = el("div", { id: "print-overlay" });
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = "";
    overlay.appendChild(buildOverlayContent());

    document.title = buildSaveFilename(container, data) || originalTitle;
    document.body.classList.add("is-printing-block");

    function restore() {
      if (restored) return;
      restored = true;
      document.body.classList.remove("is-printing-block");
      overlay.innerHTML = "";
      document.title = originalTitle;
      // Something on the page (focus handling, the toc scrollspy, or
      // the browser's own scroll-position clamping while most of the
      // page was hidden for printing) can re-adjust the scroll
      // position slightly after we restore it once. Re-assert the
      // saved position a few times over a short window so the final,
      // settled state is reliably correct rather than a race.
      var root = document.documentElement;
      var prevBehavior = root.style.scrollBehavior;
      function jump() {
        root.style.scrollBehavior = "auto";
        window.scrollTo(scrollX, scrollY);
      }
      [0, 30, 80, 150, 300, 500].forEach(function (delay) {
        setTimeout(jump, delay);
      });
      setTimeout(function () {
        root.style.scrollBehavior = prevBehavior;
      }, 520);
      window.removeEventListener("afterprint", restore);
    }

    window.addEventListener("afterprint", restore);
    window.print();
    // Fallback in case `afterprint` doesn't fire (seen in some
    // browsers' print-to-PDF flows) — doesn't fire early because
    // `restored` guards against a double-restore.
    setTimeout(restore, 1000);
  }

  /* ------------------------------------------------------------- *
   * Item renderers — one per exercise type.
   * Each renderer returns { node, reset(), grade() }. grade() locks
   * the item, reveals correct/incorrect state + explanation, and
   * returns { correct, attempted }.
   * ------------------------------------------------------------- */
  var renderers = {};

  function itemShell(index, promptHtml) {
    var wrap = el("div", { class: "exercise-item", "data-item-index": index });
    var num = el("span", { class: "exercise-item__number", "aria-hidden": "true", text: String(index + 1) });
    if (promptHtml !== null) {
      var p = el("p", { class: "exercise-item__prompt" });
      p.appendChild(num);
      var span = el("span");
      span.innerHTML = promptHtml;
      p.appendChild(span);
      wrap.appendChild(p);
    }
    return wrap;
  }

  function feedbackNode(explanation) {
    var fb = el("div", { class: "item-feedback", role: "status" });
    var body = el("div", { class: "item-feedback__body" });
    var strong = el("strong");
    body.appendChild(strong);
    var explanationEl = null;
    if (explanation) {
      explanationEl = el("span", { text: explanation });
      body.appendChild(explanationEl);
    }
    fb.appendChild(body);
    // explanationEl is kept so setFeedback() can insert "Correct answer: …"
    // right before it — the answer should always lead, then the reason why.
    return { node: fb, strongEl: strong, body: body, explanationEl: explanationEl };
  }

  function setFeedback(fbRef, correct, correctAnswerText, iconWrap) {
    fbRef.node.classList.add("is-visible");
    fbRef.node.classList.toggle("is-correct", correct);
    fbRef.node.classList.toggle("is-incorrect", !correct);
    iconWrap.innerHTML = "";
    iconWrap.appendChild(iconSpan(correct ? "check" : "cross"));
    fbRef.strongEl.textContent = correct ? "Correto." : "Quase l\u00e1.";
    if (!correct && correctAnswerText) {
      var existing = fbRef.body.querySelector(".correct-answer");
      if (!existing) {
        var correctAnswerEl = el("div", { class: "correct-answer", html: "<em>Resposta correta:</em> " + correctAnswerText });
        // The correct form must come before the explanation of why, not
        // after it — insert ahead of the (already-appended) explanation
        // span rather than appending, which used to put it last.
        if (fbRef.explanationEl) fbRef.body.insertBefore(correctAnswerEl, fbRef.explanationEl);
        else fbRef.body.appendChild(correctAnswerEl);
      }
    }
  }

  // ---- multiple-choice / vocabulary / reading-comprehension question ----
  // Options are displayed in a shuffled order (Fisher-Yates, via the
  // shared shuffled() helper) so the correct answer doesn't keep landing
  // in the same position across every question -- an audit of this
  // course's curriculum data showed correct answers heavily concentrated
  // at option B (55.6%). Each rendered <input> keeps `value` set to the
  // option's *original* index into item.options (origIndex below), not
  // its on-screen position, so item.answerIndex, extractChoice() (used by
  // the "save answers" print feature) and any other code that reasons
  // about option identity by original index keeps working unchanged --
  // only the DOM order changes, once, at render time. Shuffling happens
  // exactly once per page load (here, when the item is first built), not
  // on every re-render/reset, so retrying a question never reshuffles
  // the options out from under the student mid-attempt.
  function renderChoice(item, index) {
    var wrap = itemShell(index, item.prompt);
    var fieldset = el("fieldset");
    fieldset.appendChild(el("legend", { class: "visually-hidden", text: "Escolha uma resposta" }));
    var list = el("div", { class: "option-list" });
    var name = uniqueId(item.id);
    var optionEls = [];

    var options = item.options || [];
    var order = shuffled(options.map(function (opt, i) { return i; }));

    order.forEach(function (origIndex) {
      var inputId = name + "_" + origIndex;
      var input = el("input", { type: "radio", name: name, id: inputId, value: String(origIndex) });
      var label = el("label", { class: "option", for: inputId }, [
        input,
        el("span", { class: "option__label", text: options[origIndex] }),
      ]);
      optionEls.push({ input: input, label: label, origIndex: origIndex });
      list.appendChild(label);
    });

    fieldset.appendChild(list);
    wrap.appendChild(fieldset);

    var iconWrap = el("span");
    var fb = feedbackNode(item.explanation || "");
    fb.node.insertBefore(iconWrap, fb.node.firstChild);
    wrap.appendChild(fb.node);

    return {
      node: wrap,
      reset: function () {
        optionEls.forEach(function (o) {
          o.input.checked = false;
          o.input.disabled = false;
          o.label.classList.remove("is-correct", "is-incorrect");
          var tag = o.label.querySelector(".option__tag");
          if (tag) tag.remove();
        });
        fb.node.classList.remove("is-visible", "is-correct", "is-incorrect");
        var ca = fb.body.querySelector(".correct-answer");
        if (ca) ca.remove();
        wrap.classList.remove("is-locked");
      },
      grade: function () {
        var checkedEntry = optionEls.find(function (o) { return o.input.checked; });
        var chosen = checkedEntry ? checkedEntry.origIndex : -1;
        var correct = chosen === item.answerIndex;
        optionEls.forEach(function (o) {
          o.input.disabled = true;
          if (o.origIndex === item.answerIndex) {
            o.label.classList.add("is-correct");
            o.label.appendChild(el("span", { class: "option__tag", "aria-hidden": "true", text: "\u2713 correta" }));
          } else if (o.origIndex === chosen) {
            o.label.classList.add("is-incorrect");
            o.label.appendChild(el("span", { class: "option__tag", "aria-hidden": "true", text: "\u2717 sua resposta" }));
          }
        });
        wrap.classList.add("is-locked");
        setFeedback(fb, correct, null, iconWrap);
        return { correct: correct, attempted: chosen !== -1 };
      },
    };
  }
  renderers["multiple-choice"] = renderChoice;
  renderers["vocabulary"] = renderChoice;
  renderers["reading-comprehension"] = renderChoice;

  // ---- true-false ----
  function renderTrueFalse(item, index) {
    var wrap = itemShell(index, item.statement);
    var fieldset = el("fieldset");
    fieldset.appendChild(el("legend", { class: "visually-hidden", text: "Verdadeiro ou falso" }));
    var list = el("div", { class: "option-list tf-options" });
    var name = uniqueId(item.id);
    var trueId = name + "_t", falseId = name + "_f";
    var trueInput = el("input", { type: "radio", name: name, id: trueId, value: "true" });
    var falseInput = el("input", { type: "radio", name: name, id: falseId, value: "false" });
    var trueLabel = el("label", { class: "option", for: trueId }, [trueInput, el("span", { class: "option__label", text: "Verdadeiro" })]);
    var falseLabel = el("label", { class: "option", for: falseId }, [falseInput, el("span", { class: "option__label", text: "Falso" })]);
    list.appendChild(trueLabel);
    list.appendChild(falseLabel);
    fieldset.appendChild(list);
    wrap.appendChild(fieldset);

    var iconWrap = el("span");
    var fb = feedbackNode(item.explanation || "");
    fb.node.insertBefore(iconWrap, fb.node.firstChild);
    wrap.appendChild(fb.node);

    return {
      node: wrap,
      reset: function () {
        trueInput.checked = false; falseInput.checked = false;
        trueInput.disabled = false; falseInput.disabled = false;
        trueLabel.classList.remove("is-correct", "is-incorrect");
        falseLabel.classList.remove("is-correct", "is-incorrect");
        var t1 = trueLabel.querySelector(".option__tag"); if (t1) t1.remove();
        var t2 = falseLabel.querySelector(".option__tag"); if (t2) t2.remove();
        fb.node.classList.remove("is-visible", "is-correct", "is-incorrect");
        wrap.classList.remove("is-locked");
      },
      grade: function () {
        var chosen = trueInput.checked ? true : falseInput.checked ? false : null;
        var correct = chosen === item.answer;
        trueInput.disabled = true; falseInput.disabled = true;
        var correctLabel = item.answer ? trueLabel : falseLabel;
        correctLabel.classList.add("is-correct");
        correctLabel.appendChild(el("span", { class: "option__tag", "aria-hidden": "true", text: "\u2713 correta" }));
        if (chosen !== null && chosen !== item.answer) {
          var wrongLabel = chosen ? trueLabel : falseLabel;
          wrongLabel.classList.add("is-incorrect");
          wrongLabel.appendChild(el("span", { class: "option__tag", "aria-hidden": "true", text: "\u2717 sua resposta" }));
        }
        wrap.classList.add("is-locked");
        setFeedback(fb, correct, null, iconWrap);
        return { correct: correct, attempted: chosen !== null };
      },
    };
  }
  renderers["true-false"] = renderTrueFalse;

  // ---- fill-blank ----
  // item.prompt uses "___" to mark each blank. item.answers is an array
  // (one entry per blank), each entry a string or array of accepted strings.
  //
  // Each blank renders as a <select> when the item supplies options for it,
  // and falls back to a free-text <input> otherwise (kept for any item that
  // hasn't been migrated to a dropdown yet). Options can be given two ways:
  //   - "options": ["friend", "friends", "friendly"]   (single blank)
  //   - "options": [["is","are"], ["have","has"]]       (one array per blank)
  // The correct answer's position is shuffled per render so it isn't always
  // first. Grading is unchanged — it still matches the control's value
  // against item.answers[i], which works identically for <input> and
  // <select> since both expose a plain .value.
  function renderFillBlank(item, index) {
    var wrap = itemShell(index, null);
    var sentence = el("p", { class: "blank-sentence exercise-item__prompt" });
    var num = el("span", { class: "exercise-item__number", "aria-hidden": "true", text: String(index + 1) });
    sentence.appendChild(num);

    var parts = String(item.prompt).split("___");
    var numBlanks = parts.length - 1;

    function optionsForBlank(i) {
      if (!item.options || !item.options.length) return null;
      // Per-blank arrays: "options": [["a","b"], ["c","d"]]
      if (Array.isArray(item.options[0])) return item.options[i] || null;
      // Flat array applies to a single-blank item: "options": ["a","b","c"]
      return numBlanks === 1 ? item.options : null;
    }

    var inputs = [];
    parts.forEach(function (part, i) {
      sentence.appendChild(document.createTextNode(part));
      if (i < numBlanks) {
        var blankOptions = optionsForBlank(i);
        var control;
        if (blankOptions && blankOptions.length) {
          control = el("select", {
            class: "blank-input",
            "aria-label": "Lacuna " + (i + 1) + " de " + numBlanks,
          });
          control.appendChild(el("option", { value: "", text: "Escolher…" }));
          shuffled(blankOptions).forEach(function (opt) {
            control.appendChild(el("option", { value: opt, text: opt }));
          });
        } else {
          control = el("input", {
            type: "text",
            class: "blank-input",
            "aria-label": "Lacuna " + (i + 1) + " de " + numBlanks,
            autocomplete: "off",
            autocapitalize: "off",
            spellcheck: "false",
          });
        }
        inputs.push(control);
        sentence.appendChild(control);
      }
    });
    wrap.appendChild(sentence);

    var fb = feedbackNode(item.explanation || "");
    var iconWrap = el("span");
    fb.node.insertBefore(iconWrap, fb.node.firstChild);
    wrap.appendChild(fb.node);

    return {
      node: wrap,
      reset: function () {
        inputs.forEach(function (inp) {
          inp.value = "";
          inp.disabled = false;
          inp.classList.remove("is-correct", "is-incorrect");
        });
        fb.node.classList.remove("is-visible", "is-correct", "is-incorrect");
        var ca = fb.body.querySelector(".correct-answer");
        if (ca) ca.remove();
        wrap.classList.remove("is-locked");
      },
      grade: function () {
        var allCorrect = true;
        var attempted = false;
        var answers = item.answers || [];
        inputs.forEach(function (inp, i) {
          if (inp.value.trim()) attempted = true;
          var ok = matchesAny(inp.value, answers[i]);
          inp.classList.add(ok ? "is-correct" : "is-incorrect");
          inp.disabled = true;
          if (!ok) allCorrect = false;
        });
        wrap.classList.add("is-locked");
        var correctText = (item.answers || []).map(function (a) { return Array.isArray(a) ? a[0] : a; }).join(" &middot; ");
        setFeedback(fb, allCorrect, allCorrect ? null : correctText, iconWrap);
        return { correct: allCorrect, attempted: attempted };
      },
    };
  }
  renderers["fill-blank"] = renderFillBlank;

  // ---- correction (grammar correction) ----
  function renderCorrection(item, index) {
    var wrap = itemShell(index, null);
    wrap.appendChild(el("p", { class: "exercise-item__source", html: "&ldquo;" + item.incorrect + "&rdquo;" }));
    var qid = uniqueId(item.id);
    var label = el("label", { class: "exercise-item__prompt", for: qid });
    label.appendChild(el("span", { class: "exercise-item__number", "aria-hidden": "true", text: String(index + 1) }));
    label.appendChild(document.createTextNode("Escreva a frase correta:"));
    wrap.appendChild(label);
    var input = el("input", { type: "text", id: qid, class: "answer-input", autocomplete: "off", spellcheck: "false" });
    wrap.appendChild(input);

    var fb = feedbackNode(item.explanation || "");
    var iconWrap = el("span");
    fb.node.insertBefore(iconWrap, fb.node.firstChild);
    wrap.appendChild(fb.node);

    return {
      node: wrap,
      reset: function () {
        input.value = ""; input.disabled = false;
        input.classList.remove("is-correct", "is-incorrect");
        fb.node.classList.remove("is-visible", "is-correct", "is-incorrect");
        var ca = fb.body.querySelector(".correct-answer");
        if (ca) ca.remove();
        wrap.classList.remove("is-locked");
      },
      grade: function () {
        var ok = matchesAny(input.value, item.answer);
        input.classList.add(ok ? "is-correct" : "is-incorrect");
        input.disabled = true;
        wrap.classList.add("is-locked");
        var correctText = Array.isArray(item.answer) ? item.answer[0] : item.answer;
        setFeedback(fb, ok, ok ? null : correctText, iconWrap);
        return { correct: ok, attempted: input.value.trim().length > 0 };
      },
    };
  }
  renderers["correction"] = renderCorrection;

  // ---- typing (short-answer; graded if item.answer given, else self-check) ----
  function renderTyping(item, index) {
    var wrap = itemShell(index, item.prompt);
    var input = el("input", { type: "text", class: "answer-input", autocomplete: "off", spellcheck: "false", "aria-label": item.prompt || "Sua resposta" });
    wrap.appendChild(input);

    var selfCheck = !item.answer;
    var fb = feedbackNode(selfCheck ? "" : item.explanation || "");
    var iconWrap = el("span");
    if (!selfCheck) fb.node.insertBefore(iconWrap, fb.node.firstChild);
    wrap.appendChild(fb.node);

    return {
      node: wrap,
      reset: function () {
        input.value = ""; input.disabled = false;
        input.classList.remove("is-correct", "is-incorrect");
        fb.node.classList.remove("is-visible", "is-correct", "is-incorrect");
        var ma = fb.body.querySelector(".model-answer");
        if (ma) ma.remove();
        var ca = fb.body.querySelector(".correct-answer");
        if (ca) ca.remove();
        wrap.classList.remove("is-locked");
      },
      grade: function () {
        input.disabled = true;
        wrap.classList.add("is-locked");
        if (selfCheck) {
          fb.node.classList.add("is-visible");
          fb.strongEl.textContent = item.modelAnswer ? "Resposta modelo:" : "Salvo para sua revis\u00e3o.";
          if (item.modelAnswer && !fb.body.querySelector(".model-answer")) {
            fb.body.appendChild(el("div", { class: "model-answer", text: item.modelAnswer }));
          }
          return { correct: true, attempted: input.value.trim().length > 0, selfCheck: true };
        }
        var ok = matchesAny(input.value, item.answer);
        input.classList.add(ok ? "is-correct" : "is-incorrect");
        var correctText = Array.isArray(item.answer) ? item.answer[0] : item.answer;
        setFeedback(fb, ok, ok ? null : correctText, iconWrap);
        return { correct: ok, attempted: input.value.trim().length > 0 };
      },
    };
  }
  renderers["typing"] = renderTyping;

  // ---- matching (dropdown-based: accessible & mobile-friendly) ----
  function renderMatching(item, index) {
    var wrap = itemShell(index, null);
    var table = el("div", { class: "match-table" });
    var rightOptions = shuffled(item.pairs.map(function (p) { return p.right; }));
    var selects = [];
    var rowWraps = [];

    item.pairs.forEach(function (pair, i) {
      var rowWrap = el("div", { class: "match-row-wrap" });
      var row = el("div", { class: "match-row" });
      row.appendChild(el("span", { class: "match-row__left" }, [
        el("span", { class: "exercise-item__number", "aria-hidden": "true", text: String(i + 1) }),
        el("span", { text: pair.left }),
      ]));
      row.appendChild(el("span", { class: "match-row__arrow", "aria-hidden": "true", text: "\u2192" }));
      var select = el("select", { class: "answer-input", "aria-label": "Combina\u00e7\u00e3o para " + pair.left });
      select.appendChild(el("option", { value: "", text: "Escolher\u2026" }));
      rightOptions.forEach(function (opt) {
        select.appendChild(el("option", { value: opt, text: opt }));
      });
      selects.push(select);
      row.appendChild(select);
      rowWrap.appendChild(row);
      table.appendChild(rowWrap);
      rowWraps.push(rowWrap);
    });
    wrap.appendChild(table);

    var fb = feedbackNode(item.explanation || "");
    var iconWrap = el("span");
    fb.node.insertBefore(iconWrap, fb.node.firstChild);
    wrap.appendChild(fb.node);

    return {
      node: wrap,
      reset: function () {
        selects.forEach(function (s) { s.value = ""; s.disabled = false; s.classList.remove("is-correct", "is-incorrect"); });
        rowWraps.forEach(function (rw) {
          var hint = rw.querySelector(".match-row__correct");
          if (hint) hint.remove();
        });
        fb.node.classList.remove("is-visible", "is-correct", "is-incorrect");
        wrap.classList.remove("is-locked");
      },
      grade: function () {
        var allCorrect = true, attempted = false;
        selects.forEach(function (s, i) {
          if (s.value) attempted = true;
          var ok = norm(s.value) === norm(item.pairs[i].right);
          s.classList.add(ok ? "is-correct" : "is-incorrect");
          s.disabled = true;
          if (!ok) {
            allCorrect = false;
            // Unlike fill-blank/correction, a wrong matching pick has no
            // separate place to reveal what the right pairing actually
            // was \u2014 the select just turns red. Add it explicitly so the
            // right answer is visible on screen (and therefore also in
            // the printed/PDF copy once its value is captured).
            rowWraps[i].appendChild(el("p", {
              class: "match-row__correct",
              html: "<em>Correto:</em> " + escapeHtml(item.pairs[i].right),
            }));
          }
        });
        wrap.classList.add("is-locked");
        setFeedback(fb, allCorrect, null, iconWrap);
        return { correct: allCorrect, attempted: attempted };
      },
    };
  }
  renderers["matching"] = renderMatching;

  // ---- ordering (sentence ordering via word chips) ----
  function renderOrdering(item, index) {
    var wrap = itemShell(index, item.prompt || "Coloque as palavras na ordem correta.");
    var buildArea = el("div", { class: "order-build", role: "list", "aria-label": "Sua frase" });
    var pool = el("div", { class: "order-pool", role: "list", "aria-label": "Palavras dispon\u00edveis" });
    var words = item.words;
    var chips = shuffled(words.map(function (w, i) { return { word: w, key: i, placed: false }; }));
    var built = [];

    function renderPool() {
      pool.innerHTML = "";
      chips.forEach(function (c) {
        var chip = el("button", { type: "button", class: "word-chip" + (c.placed ? " is-placed" : ""), text: c.word });
        chip.disabled = !!c.placed;
        chip.addEventListener("click", function () {
          c.placed = true;
          built.push(c);
          renderPool();
          renderBuild();
        });
        pool.appendChild(chip);
      });
    }
    function renderBuild() {
      buildArea.innerHTML = "";
      built.forEach(function (c) {
        var chip = el("button", { type: "button", class: "word-chip", text: c.word, "aria-label": "Remover " + c.word });
        chip.addEventListener("click", function () {
          c.placed = false;
          built = built.filter(function (b) { return b !== c; });
          renderPool();
          renderBuild();
        });
        buildArea.appendChild(chip);
      });
    }
    renderPool();
    renderBuild();

    var resetBtn = el("button", { type: "button", class: "btn btn--ghost btn--small order-reset", text: "Limpar" });
    resetBtn.addEventListener("click", function () {
      built.forEach(function (c) { c.placed = false; });
      built = [];
      renderPool();
      renderBuild();
    });

    wrap.appendChild(buildArea);
    wrap.appendChild(pool);
    wrap.appendChild(resetBtn);

    var fb = feedbackNode(item.explanation || "");
    var iconWrap = el("span");
    fb.node.insertBefore(iconWrap, fb.node.firstChild);
    wrap.appendChild(fb.node);

    return {
      node: wrap,
      reset: function () {
        chips.forEach(function (c) { c.placed = false; });
        built = [];
        renderPool();
        renderBuild();
        fb.node.classList.remove("is-visible", "is-correct", "is-incorrect");
        var ca = fb.body.querySelector(".correct-answer");
        if (ca) ca.remove();
        wrap.classList.remove("is-locked");
        resetBtn.disabled = false;
      },
      grade: function () {
        var userOrder = built.map(function (c) { return c.word; });
        var correct = userOrder.length === words.length && userOrder.every(function (w, i) { return w === words[i]; });
        buildArea.querySelectorAll(".word-chip").forEach(function (b) { b.disabled = true; });
        pool.querySelectorAll(".word-chip").forEach(function (b) { b.disabled = true; });
        resetBtn.disabled = true;
        wrap.classList.add("is-locked");
        var correctText = words.join(" ");
        setFeedback(fb, correct, correct ? null : correctText, iconWrap);
        return { correct: correct, attempted: userOrder.length > 0 };
      },
    };
  }
  renderers["ordering"] = renderOrdering;

  /* ------------------------------------------------------------- *
   * Block controller — wires items + submit/retry/score for one
   * .exercise-block
   * ------------------------------------------------------------- */
  function scorePanelNode() {
    var panel = el("div", { class: "score-panel", role: "status", "aria-live": "polite" });
    var ring = el("div", { class: "score-panel__ring", text: "" });
    var textWrap = el("div", { class: "score-panel__text" });
    panel.appendChild(ring);
    panel.appendChild(textWrap);
    return { node: panel, ring: ring, textWrap: textWrap };
  }

  function buildBlock(container, data) {
    var head = el("div", { class: "exercise-block__head" });
    head.appendChild(el("span", { class: "exercise-block__type", text: TYPE_LABELS[data.type] || data.type.replace(/-/g, " ") }));
    head.appendChild(el("h3", { class: "exercise-block__title", text: data.title || "Exerc\u00edcio" }));
    if (data.instructions) head.appendChild(el("p", { class: "exercise-block__instructions", text: data.instructions }));
    container.appendChild(head);

    if (data.passage) {
      container.appendChild(el("div", { class: "reading-passage", html: data.passage }));
    }

    var scoreTop = scorePanelNode();
    container.appendChild(scoreTop.node);

    var itemsWrap = el("div", { class: "exercise-block__items" });
    container.appendChild(itemsWrap);

    var renderFn = renderers[data.type];
    if (!renderFn) {
      itemsWrap.appendChild(el("p", { text: "Tipo de exerc\u00edcio n\u00e3o suportado: " + data.type }));
      return;
    }

    var built = (data.items || []).map(function (item, i) {
      var r = renderFn(item, i);
      itemsWrap.appendChild(r.node);
      return r;
    });

    var scoreBottom = scorePanelNode();
    container.appendChild(scoreBottom.node);
    var scorePanels = [scoreTop, scoreBottom];

    var actions = el("div", { class: "exercise-actions" });
    var submitBtn = el("button", { type: "button", class: "btn btn--accent", text: "Enviar" });
    var retryBtn = el("button", { type: "button", class: "btn btn--ghost", text: "Refazer s\u00f3 os errados" });
    var retryAllBtn = el("button", { type: "button", class: "btn btn--ghost", text: "Refazer tudo" });
    var printBtn = el("button", { type: "button", class: "btn btn--ghost print-hidden", text: "Salvar minhas respostas" });
    retryBtn.style.display = "none";
    retryAllBtn.style.display = "none";
    printBtn.style.display = "none";
    actions.appendChild(submitBtn);
    actions.appendChild(retryBtn);
    actions.appendChild(retryAllBtn);
    actions.appendChild(printBtn);
    container.appendChild(actions);

    var lastResults = null;

    function showScore(results) {
      var correctCount = results.filter(function (r) { return r.correct; }).length;
      var total = results.length;
      var pct = total ? Math.round((correctCount / total) * 100) : 0;
      var ringClass = pct < 50 ? "is-low" : pct < 80 ? "is-mid" : "";
      var headingText = pct === 100 ? "Excelente \u2014 pontua\u00e7\u00e3o perfeita!" : pct >= 80 ? "Muito bem." : pct >= 50 ? "Bom progresso." : "Continue praticando.";
      var subText = correctCount + " de " + total + " corretas (" + pct + "%).";
      scorePanels.forEach(function (sp) {
        sp.ring.textContent = correctCount + "/" + total;
        sp.ring.classList.remove("is-low", "is-mid");
        if (ringClass) sp.ring.classList.add(ringClass);
        sp.textWrap.innerHTML = "";
        sp.textWrap.appendChild(el("h4", { text: headingText }));
        sp.textWrap.appendChild(el("p", { text: subText }));
        sp.node.classList.add("is-visible");
      });
    }

    submitBtn.addEventListener("click", function () {
      lastResults = built.map(function (r) { return r.grade(); });
      showScore(lastResults);
      submitBtn.style.display = "none";
      var anyIncorrect = lastResults.some(function (r) { return !r.correct; });
      retryBtn.style.display = anyIncorrect ? "" : "none";
      retryAllBtn.style.display = "";
      printBtn.style.display = "";
      // Each result gets the id of the item it came from (built[i] and
      // data.items[i] are always positionally aligned -- see `built`
      // above). This is what lets assets/js/mastery.js track per-item
      // spaced-repetition history; nothing here changes grading, and
      // existing consumers of this event that only read r.correct are
      // unaffected by the extra field.
      var resultsWithItemIds = lastResults.map(function (r, i) {
        var withId = {};
        for (var k in r) { if (Object.prototype.hasOwnProperty.call(r, k)) withId[k] = r[k]; }
        withId.itemId = (data.items[i] || {}).id;
        return withId;
      });
      container.dispatchEvent(new CustomEvent("exercise:submitted", {
        bubbles: true,
        detail: { id: data.id, results: resultsWithItemIds },
      }));

      // Gamification (assets/js/progress.js) — optional by design: if
      // that script hasn't loaded on a given page, grading above still
      // works exactly the same, nothing here is required for it.
      if (window.ProgressTracker && typeof window.ProgressTracker.recordExerciseResult === "function") {
        var correctCount = lastResults.filter(function (r) { return r.correct; }).length;
        var total = lastResults.length;
        window.ProgressTracker.recordExerciseResult({
          exerciseId: data.id,
          level: document.body.getAttribute("data-level-code") || "",
          correct: correctCount,
          total: total,
          perfect: total > 0 && correctCount === total,
        });
      }
    });

    printBtn.addEventListener("click", function () {
      performSaveAnswers(container, data, function () {
        var clone = container.cloneNode(true);
        syncLiveFormState(container, clone);
        return wrapWithPrintHeader(buildExercisePrintHeaderText(container, data), clone);
      });
    });

    retryBtn.addEventListener("click", function () {
      built.forEach(function (r, i) {
        if (!lastResults[i].correct) r.reset();
      });
      scorePanels.forEach(function (sp) { sp.node.classList.remove("is-visible"); });
      submitBtn.style.display = "";
      retryBtn.style.display = "none";
      retryAllBtn.style.display = "none";
      printBtn.style.display = "none";
      var firstOpen = itemsWrap.querySelector(".exercise-item:not(.is-locked)");
      if (firstOpen) firstOpen.scrollIntoView({ behavior: "smooth", block: "center" });
    });

    retryAllBtn.addEventListener("click", function () {
      built.forEach(function (r) { r.reset(); });
      scorePanels.forEach(function (sp) { sp.node.classList.remove("is-visible"); });
      submitBtn.style.display = "";
      retryBtn.style.display = "none";
      retryAllBtn.style.display = "none";
      printBtn.style.display = "none";
    });
  }

  /* ---------------------------------------------------------------
     Writing prompts — free-text, ungraded. No submit/check button;
     the only action is saving/printing the prompt(s) together with
     whatever the student has written, exactly as-is.
     --------------------------------------------------------------- */
  function buildWritingBlock(container, data) {
    var head = el("div", { class: "exercise-block__head" });
    head.appendChild(el("span", { class: "exercise-block__type", text: "escrita" }));
    head.appendChild(el("h3", { class: "exercise-block__title", text: data.title || "Escrita" }));
    if (data.instructions) head.appendChild(el("p", { class: "exercise-block__instructions", text: data.instructions }));
    container.appendChild(head);

    var itemsWrap = el("div", { class: "exercise-block__items" });
    container.appendChild(itemsWrap);

    var textareas = [];
    (data.items || []).forEach(function (item, i) {
      var wrap = el("div", { class: "exercise-item writing-item" });
      wrap.appendChild(el("span", { class: "exercise-item__number", "aria-hidden": "true", text: String(i + 1) }));
      var promptEl = el("p", { class: "exercise-item__prompt writing-item__prompt", text: item.prompt || "" });
      wrap.appendChild(promptEl);
      var textarea = el("textarea", {
        class: "writing-item__textarea",
        rows: "6",
        placeholder: "Escreva sua resposta aqui\u2026",
        "aria-label": item.prompt || "Sua resposta",
      });
      textarea.dataset.prompt = item.prompt || "";
      textareas.push(textarea);
      wrap.appendChild(textarea);
      itemsWrap.appendChild(wrap);
    });

    var actions = el("div", { class: "exercise-actions" });
    var saveBtn = el("button", { type: "button", class: "btn btn--ghost print-hidden", text: "Salvar minhas respostas" });
    actions.appendChild(saveBtn);
    container.appendChild(actions);

    saveBtn.addEventListener("click", function () {
      performSaveAnswers(container, data, function () {
        var printWrap = el("div", { class: "exercise-block" });
        printWrap.appendChild(el("h3", { class: "exercise-block__title", text: data.title || "Escrita" }));
        textareas.forEach(function (ta, i) {
          var block = el("div", { class: "writing-item" });
          block.appendChild(el("p", { class: "writing-item__prompt", text: "" + (i + 1) + ". " + (ta.dataset.prompt || "") }));
          var answerP = el("p", { class: "writing-item__saved-answer" });
          answerP.textContent = ta.value.trim() || "(Ainda sem resposta escrita.)";
          block.appendChild(answerP);
          printWrap.appendChild(block);
        });
        return wrapWithPrintHeader(buildExercisePrintHeaderText(container, data), printWrap);
      });
    });
  }

  /* ---------------------------------------------------------------
     Topic-level and full-test answer aggregation
     ------------------------------------------------------------------
     A shared pipeline — exercise state -> normalized answer data ->
     topic/test aggregation -> save/print — that the per-exercise
     "Save Topic Answers" button and the page-level "Save All Test
     Yourself Answers" button both build on, rather than each
     re-implementing its own way of reading answers out of the DOM.

     collectExerciseAnswers(container, data) reads ONE exercise
     block's current live state (never the original exercise-data
     answer key alone) into a normalized { question, userAnswer,
     correctAnswer, result, explanation } shape per item.
     collectTopicAnswers(topicSection) collects every exercise inside
     one "Test Yourself" topic <section>. collectTestYourselfAnswers()
     collects every topic on the page. Each level is a thin wrapper
     around the one below it.
     --------------------------------------------------------------- */

  function extractChoice(itemEl, item) {
    var checked = itemEl.querySelector('input[type="radio"]:checked');
    var options = item.options || [];
    var userIndex = checked ? Number(checked.value) : -1;
    var attempted = userIndex >= 0;
    return {
      question: item.prompt || "",
      userAnswer: attempted ? options[userIndex] : null,
      correctAnswer: options[item.answerIndex],
      result: !attempted ? "unanswered" : (userIndex === item.answerIndex ? "correct" : "incorrect"),
      explanation: item.explanation || "",
    };
  }

  function extractTrueFalse(itemEl, item) {
    var checked = itemEl.querySelector('input[type="radio"]:checked');
    var userAnswer = checked ? checked.value === "true" : null;
    return {
      question: item.statement || "",
      userAnswer: checked ? (userAnswer ? "Verdadeiro" : "Falso") : null,
      correctAnswer: item.answer ? "Verdadeiro" : "Falso",
      result: !checked ? "unanswered" : (userAnswer === item.answer ? "correct" : "incorrect"),
      explanation: item.explanation || "",
    };
  }

  function extractFillBlank(itemEl, item) {
    var blanks = itemEl.querySelectorAll(".blank-input");
    var values = Array.prototype.map.call(blanks, function (b) { return b.value; });
    var attempted = values.some(function (v) { return v && v.trim(); });
    var answers = item.answers || [];
    var allCorrect = values.length > 0 && values.every(function (v, i) { return matchesAny(v, answers[i]); });
    var correctText = answers.map(function (a) { return Array.isArray(a) ? a[0] : a; }).join(" · ");
    var userText = values.map(function (v) { return v && v.trim() ? v : "(blank)"; }).join(" / ");
    return {
      question: String(item.prompt || "").replace(/___/g, "____"),
      userAnswer: attempted ? userText : null,
      correctAnswer: correctText,
      result: !attempted ? "unanswered" : (allCorrect ? "correct" : "incorrect"),
      explanation: item.explanation || "",
    };
  }

  function extractCorrection(itemEl, item) {
    var input = itemEl.querySelector(".answer-input");
    var val = input ? input.value : "";
    var attempted = val.trim().length > 0;
    var ok = attempted && matchesAny(val, item.answer);
    var correctText = Array.isArray(item.answer) ? item.answer[0] : item.answer;
    return {
      question: "“" + item.incorrect + "”",
      userAnswer: attempted ? val : null,
      correctAnswer: correctText,
      result: !attempted ? "unanswered" : (ok ? "correct" : "incorrect"),
      explanation: item.explanation || "",
    };
  }

  function extractTyping(itemEl, item) {
    var input = itemEl.querySelector(".answer-input");
    var val = input ? input.value : "";
    var attempted = val.trim().length > 0;
    if (!item.answer) {
      return {
        question: item.prompt || "",
        userAnswer: attempted ? val : null,
        correctAnswer: item.modelAnswer || null,
        result: attempted ? "self-check" : "unanswered",
        explanation: item.explanation || "",
      };
    }
    var ok = attempted && matchesAny(val, item.answer);
    var correctText = Array.isArray(item.answer) ? item.answer[0] : item.answer;
    return {
      question: item.prompt || "",
      userAnswer: attempted ? val : null,
      correctAnswer: correctText,
      result: !attempted ? "unanswered" : (ok ? "correct" : "incorrect"),
      explanation: item.explanation || "",
    };
  }

  function extractMatching(itemEl, item) {
    var selects = itemEl.querySelectorAll(".match-table select");
    var rows = item.pairs.map(function (pair, i) {
      var sel = selects[i];
      var chosen = sel ? sel.value : "";
      var attempted = !!chosen;
      var ok = attempted && norm(chosen) === norm(pair.right);
      return { left: pair.left, userRight: attempted ? chosen : null, correctRight: pair.right, ok: ok, attempted: attempted };
    });
    var anyAttempted = rows.some(function (r) { return r.attempted; });
    var allCorrect = rows.length > 0 && rows.every(function (r) { return r.ok; });
    return {
      question: rows.map(function (r) { return r.left; }).join(", "),
      userAnswer: anyAttempted ? rows.map(function (r) { return r.left + " → " + (r.userRight || "(no answer)"); }).join("; ") : null,
      correctAnswer: rows.map(function (r) { return r.left + " → " + r.correctRight; }).join("; "),
      result: !anyAttempted ? "unanswered" : (allCorrect ? "correct" : "incorrect"),
      explanation: item.explanation || "",
    };
  }

  function extractOrdering(itemEl, item) {
    var chips = itemEl.querySelectorAll(".order-build .word-chip");
    var userWords = Array.prototype.map.call(chips, function (c) { return c.textContent; });
    var attempted = userWords.length > 0;
    var correct = attempted && userWords.length === item.words.length && userWords.every(function (w, i) { return w === item.words[i]; });
    return {
      question: item.prompt || "",
      userAnswer: attempted ? userWords.join(" ") : null,
      correctAnswer: item.words.join(" "),
      result: !attempted ? "unanswered" : (correct ? "correct" : "incorrect"),
      explanation: item.explanation || "",
    };
  }

  var EXTRACTORS = {
    "multiple-choice": extractChoice,
    vocabulary: extractChoice,
    "reading-comprehension": extractChoice,
    "true-false": extractTrueFalse,
    "fill-blank": extractFillBlank,
    correction: extractCorrection,
    typing: extractTyping,
    matching: extractMatching,
    ordering: extractOrdering,
  };

  function collectExerciseAnswers(container, data) {
    if (data.type === "writing") {
      var textareas = container.querySelectorAll(".writing-item__textarea");
      var writingItems = (data.items || []).map(function (item, i) {
        var ta = textareas[i];
        var val = ta ? ta.value : "";
        var attempted = val.trim().length > 0;
        return {
          question: item.prompt || "",
          userAnswer: attempted ? val : null,
          correctAnswer: null,
          result: attempted ? "self-check" : "unanswered",
          explanation: "",
        };
      });
      return { id: data.id, type: "writing", title: data.title || "Escrita", instructions: data.instructions || "", items: writingItems };
    }

    var extractor = EXTRACTORS[data.type];
    var itemsWrap = container.querySelector(".exercise-block__items");
    var itemEls = itemsWrap ? itemsWrap.querySelectorAll(":scope > .exercise-item") : [];
    var items = (data.items || []).map(function (item, i) {
      var itemEl = itemEls[i];
      if (!extractor || !itemEl) {
        return { question: item.prompt || item.statement || "", userAnswer: null, correctAnswer: null, result: "unsupported", explanation: item.explanation || "" };
      }
      return extractor(itemEl, item);
    });
    return { id: data.id, type: data.type, title: data.title || "Exerc\u00edcio", instructions: data.instructions || "", items: items };
  }

  function collectTopicAnswers(topicSection) {
    var heading = topicSection.querySelector(".section__head h2, h2, h3");
    var topicTitle = heading ? heading.textContent.trim() : (topicSection.id || "T\u00f3pico");
    var exercises = [];
    topicSection.querySelectorAll(".exercise-block").forEach(function (block) {
      var script = block.querySelector("script.exercise-data");
      if (!script) return;
      try {
        var data = JSON.parse(script.textContent);
        exercises.push(collectExerciseAnswers(block, data));
      } catch (e) {
        if (window.console) console.error("Could not collect answers for an exercise block", e);
      }
    });
    return { level: document.body.getAttribute("data-level-code") || "", topic: topicTitle, id: topicSection.id || "", exercises: exercises };
  }

  function collectTestYourselfAnswers() {
    var topics = [];
    document.querySelectorAll(".ty-topic[id]").forEach(function (section) {
      topics.push(collectTopicAnswers(section));
    });
    return { level: document.body.getAttribute("data-level-code") || "", topics: topics };
  }

  var RESULT_LABELS = {
    correct: "Correto",
    incorrect: "Quase l\u00e1",
    unanswered: "N\u00e3o respondido",
    "self-check": "Escrito",
    unsupported: "N\u00e3o dispon\u00edvel",
  };

  function buildResultItemNode(entry) {
    var resultClass = entry.result === "correct" || entry.result === "incorrect" || entry.result === "unanswered" ? entry.result : "unanswered";
    var wrap = el("div", { class: "saved-summary-item is-" + resultClass });
    wrap.appendChild(el("p", { class: "saved-summary-item__status", text: RESULT_LABELS[entry.result] || entry.result }));
    if (entry.question) wrap.appendChild(el("p", { class: "saved-summary-item__q", text: entry.question }));
    wrap.appendChild(el("p", {
      class: "saved-summary-item__a",
      html: "<strong>Sua resposta:</strong> " + (entry.userAnswer ? escapeHtml(entry.userAnswer) : "<em>(Nenhuma resposta dada)</em>"),
    }));
    if (entry.correctAnswer) {
      wrap.appendChild(el("p", {
        class: "saved-summary-item__correct",
        html: "<strong>" + (entry.result === "self-check" ? "Resposta modelo:" : "Resposta correta:") + "</strong> " + escapeHtml(entry.correctAnswer),
      }));
    }
    if (entry.explanation) {
      wrap.appendChild(el("p", { class: "saved-summary-item__explanation", text: entry.explanation }));
    }
    return wrap;
  }

  function buildExerciseSummaryNode(ex) {
    var block = el("div", { class: "exercise-block saved-summary-block" });
    var typeLabel = TYPE_LABELS[ex.type] ? TYPE_LABELS[ex.type] + " — " : "";
    block.appendChild(el("h3", { class: "exercise-block__title", text: typeLabel + (ex.title || "Exercise") }));
    if (ex.instructions) block.appendChild(el("p", { class: "exercise-block__instructions", text: ex.instructions }));
    var list = el("div", { class: "saved-summary-list" });
    ex.items.forEach(function (entry) { list.appendChild(buildResultItemNode(entry)); });
    block.appendChild(list);
    return block;
  }

  function buildTopicSummaryNode(topic) {
    var wrap = el("div", { class: "saved-summary-topic" });
    wrap.appendChild(el("h2", { class: "saved-summary-topic__title", text: topic.topic }));
    topic.exercises.forEach(function (ex) { wrap.appendChild(buildExerciseSummaryNode(ex)); });
    return wrap;
  }

  function performTopicSave(topicSection) {
    var topic = collectTopicAnswers(topicSection);
    var fakeData = { type: null, title: "Todos os Exerc\u00edcios do T\u00f3pico \u2014 Respostas Salvas" };
    performSaveAnswers(topicSection, fakeData, function () {
      return wrapWithPrintHeader(buildTopicPrintHeaderText(topicSection), buildTopicSummaryNode(topic));
    });
  }

  function performTestSave() {
    var testData = collectTestYourselfAnswers();
    var fakeData = { type: null, title: "Teste Voc\u00ea Mesmo \u2014 Todos os T\u00f3picos \u2014 Respostas Salvas" };
    performSaveAnswers(document.body, fakeData, function () {
      var wrap = el("div", { class: "exercise-block saved-summary-root" });
      testData.topics.forEach(function (topic) { wrap.appendChild(buildTopicSummaryNode(topic)); });
      return wrapWithPrintHeader(buildTestPrintHeaderText(), wrap);
    });
  }

  function buildSaveAllAnswersButton(ariaLabel, onClick) {
    var label = "Salvar Todas as Respostas";
    var btn = el("button", {
      type: "button",
      class: "btn btn--accent print-hidden save-all-answers-btn",
      text: label,
      "aria-label": ariaLabel,
    });
    var revertTimer = null;
    btn.addEventListener("click", function () {
      onClick();
      if (revertTimer) clearTimeout(revertTimer);
      btn.textContent = "Salvo \u2713";
      revertTimer = setTimeout(function () {
        btn.textContent = label;
        revertTimer = null;
      }, 1500);
    });
    return btn;
  }

  function findLastSubmitActionsRow(root) {
    var blocks = root.querySelectorAll(".exercise-block");
    for (var i = blocks.length - 1; i >= 0; i--) {
      var actions = blocks[i].querySelector(".exercise-actions");
      var firstBtn = actions ? actions.querySelector("button") : null;
      if (firstBtn && firstBtn.textContent === "Enviar") return actions;
    }
    return null;
  }

  function insertBesideSubmit(actionsRow, btn) {
    var submitBtn = actionsRow.querySelector("button");
    if (submitBtn && submitBtn.nextSibling) {
      actionsRow.insertBefore(btn, submitBtn.nextSibling);
    } else {
      actionsRow.appendChild(btn);
    }
  }

  // Individual lesson pages have exactly one exercise-bearing section.
  // Unlike the sibling courses, which all use id="practice", this
  // course's own build_lesson.py translates the section id itself, so
  // the live id is "exercicios".
  function addPracticeSaveAllButton() {
    var practice = document.getElementById("exercicios");
    if (!practice) return;
    if (practice.querySelector(".save-all-answers-btn")) return;
    var actionsRow = findLastSubmitActionsRow(practice);
    if (!actionsRow) return;

    var heading = practice.querySelector(".section__head h2, h2, h3");
    var label = heading ? heading.textContent.trim() : "Exerc\u00edcios";

    var btn = buildSaveAllAnswersButton(
      "Salvar todas as respostas: " + label,
      function () { submitUnsubmittedBlocksIn([practice]); performGenericSave([practice], label); }
    );
    insertBesideSubmit(actionsRow, btn);
  }

  // This course has no Test Yourself page today; kept for parity with
  // the sibling courses in case one is added later (harmless no-op
  // when there are no .ty-topic sections).
  function addTestYourselfTopicSaveButtons() {
    document.querySelectorAll(".ty-topic[id]").forEach(function (topicSection) {
      var actionsRow = findLastSubmitActionsRow(topicSection);
      if (!actionsRow) return;
      var heading = topicSection.querySelector(".section__head h2, h2, h3");
      var topicTitle = heading ? heading.textContent.trim() : "este t\u00f3pico";
      var btn = buildSaveAllAnswersButton(
        "Salvar todas as respostas do t\u00f3pico: " + topicTitle,
        function () { performTopicSave(topicSection); }
      );
      insertBesideSubmit(actionsRow, btn);
    });
  }

  function submitUnsubmittedBlocksIn(roots) {
    roots.forEach(function (root) {
      root.querySelectorAll(".exercise-block").forEach(function (block) {
        var submitBtn = block.querySelector(".exercise-actions > button.btn--accent");
        if (submitBtn && submitBtn.textContent === "Enviar" && submitBtn.style.display !== "none") submitBtn.click();
      });
    });
  }

  function collectAnswersInRoots(roots) {
    var exercises = [];
    roots.forEach(function (root) {
      root.querySelectorAll(".exercise-block").forEach(function (block) {
        var script = block.querySelector("script.exercise-data");
        if (!script) return;
        try {
          var data = JSON.parse(script.textContent);
          exercises.push(collectExerciseAnswers(block, data));
        } catch (e) {
          if (window.console) console.error("Could not collect answers for an exercise block", e);
        }
      });
    });
    return exercises;
  }

  function buildGenericPrintHeaderText(label) {
    var levelCode = (document.body.getAttribute("data-level-code") || "").trim();
    var parts = [];
    if (levelCode) parts.push(levelCode);
    parts.push(label);
    return parts.join(" - ");
  }

  function performGenericSave(roots, label) {
    var exercises = collectAnswersInRoots(roots);
    var fakeData = { type: null, title: label + " - Respostas Salvas" };
    performSaveAnswers(document.body, fakeData, function () {
      var wrap = el("div", { class: "exercise-block saved-summary-root" });
      exercises.forEach(function (ex) { wrap.appendChild(buildExerciseSummaryNode(ex)); });
      return wrapWithPrintHeader(buildGenericPrintHeaderText(label), wrap);
    });
  }

  function init() {
    document.querySelectorAll(".exercise-block").forEach(function (container) {
      var dataScript = container.querySelector("script.exercise-data");
      if (!dataScript) return;
      try {
        var data = JSON.parse(dataScript.textContent);
        if (data.type === "writing") {
          buildWritingBlock(container, data);
        } else {
          buildBlock(container, data);
        }
      } catch (e) {
        container.innerHTML = "<p>This exercise could not be loaded.</p>";
        if (window.console) console.error("Exercise parse error", e);
      }
    });
    addTestYourselfTopicSaveButtons();
    addPracticeSaveAllButton();
    maybeAddTestSaveButton();
  }

  // Injects a prominent "Save All Test Yourself Answers" button into
  // the page's closing "You've reached the end…" section — only on
  // pages that actually have the Test Yourself topic structure
  // (one or more <section class="ty-topic">), so this stays generic
  // instead of being wired per-level. Runs once; leaves the existing
  // "Back to <level>" / "Continue to <next level>" links untouched.
  function maybeAddTestSaveButton() {
    var topics = document.querySelectorAll(".ty-topic[id]");
    if (!topics.length || document.getElementById("ty-save-all-btn")) return;
    var levelCode = document.body.getAttribute("data-level-code") || "";
    var wrap = el("div", { class: "lesson-nav", style: "justify-content:center;border-top:none;padding-top:0;" });
    var btn = el("button", {
      type: "button",
      id: "ty-save-all-btn",
      class: "btn btn--accent print-hidden",
      text: "Salvar Todas as Respostas do Teste Voc\u00ea Mesmo",
      "aria-label": "Salvar todas as respostas de todos os t\u00f3picos do Teste Voc\u00ea Mesmo" + (levelCode ? " " + levelCode : ""),
    });
    btn.addEventListener("click", function () {
      performTestSave();
    });
    wrap.appendChild(btn);
    var bottomNav = document.querySelector("#bottom .lesson-nav");
    if (bottomNav) {
      bottomNav.parentNode.insertBefore(wrap, bottomNav);
    } else {
      var lastTopic = topics[topics.length - 1];
      lastTopic.parentNode.insertBefore(wrap, lastTopic.nextSibling);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Minimal public API -- lets a page (today-review.html) build fresh
  // .exercise-block markup at runtime (e.g. for spaced-repetition due
  // items assembled from assets/data/exercise-items-index.json) and
  // have it graded by the exact same engine as every hand-authored
  // lesson page, instead of a second rendering implementation. Calling
  // init() again only re-scans .exercise-block elements currently in
  // the DOM; on a page that has none at load time (today-review.html
  // starts empty and injects its own), this is safe to call as many
  // times as needed with no double-processing risk.
  window.ExerciseEngine = { init: init };
})();
