/*!
 * Renan, o Professor — Gamification / Progress Tracker
 * ------------------------------------------------------------------
 * Phase 1: fully offline, localStorage-only. No account, no server,
 * works the same on GitHub Pages as anywhere else. Nothing here ever
 * sends data off the student's own browser.
 *
 * Responsibilities:
 *   1. Award XP for exercise blocks (via the "exercise:submitted"
 *      event exercises.js already dispatches, plus a direct call —
 *      see the bottom of exercises.js's submit handler).
 *   2. Track a calendar-day streak.
 *   3. Unlock data-driven badges.
 *   4. Render a compact header widget + short "+XP" toasts.
 *   5. Detect "whole page" completion (Test Yourself sections, the
 *      Placement Test) by comparing the exercises present on the
 *      current page against what's already been recorded, and award
 *      the larger one-off bonus for finishing all of them.
 *
 * Public API (window.ProgressTracker):
 *   recordExerciseResult({ level, exerciseId, correct, total, perfect })
 *   recordTestProgress({ type, level })   // "test-yourself" | "placement"
 *   getState()                            // read-only snapshot
 *   resetProgress()                       // wipes local progress (used by progress.html)
 *   XP, BADGES                            // config, read here or from progress.html
 *
 * See docs/gamification.md for the localStorage schema, how to tune
 * XP values, add a badge, and the plan for optional Phase 2 sync.
 * ------------------------------------------------------------------ */
(function () {
  "use strict";

  // Prefixado com "apt_" (Academia de Português) em vez de "rt_" —
  // sites de páginas de projeto do GitHub Pages sob o mesmo usuário
  // (ex.: renangrossi.github.io/englishclasses/ e .../aulasdeportugues/)
  // compartilham a mesma origem, logo o mesmo localStorage. Uma chave
  // diferente evita que o progresso dos dois cursos se misture no
  // navegador do aluno.
  var STORAGE_KEY = "apt_progress";
  var SCHEMA_VERSION = 1;

  /* ------------------------------------------------------------- *
   * Toast timing — how long an "+XP" / badge pop-up stays fully
   * visible before it fades out. TOAST_VISIBLE_MS is 3x the original
   * ~2.4s (2400ms) design, per docs/gamification.md "Toast duration &
   * fireworks". TOAST_EXIT_MS is the fade-out transition length and
   * matches the CSS `.xp-toast` opacity/transform transition — keep
   * these two in sync if either changes.
   * ------------------------------------------------------------- */
  var TOAST_VISIBLE_MS = 2400 * 3; // ~7.2s
  var TOAST_EXIT_MS = 350;

  /* ------------------------------------------------------------- *
   * XP table — the single place to tune point values.
   * ------------------------------------------------------------- */
  var XP = {
    exercise: 10,       // submitting an exercise block, first time (any score)
    perfectBonus: 5,    // extra, only if that first submission was 100%
    testYourself: 25,   // completing every exercise block on a Test Yourself page
    placement: 40,      // completing the Placement Test
    dailyBonus: 5,       // first activity of a new calendar day (on top of streak +1)
  };

  var LEVELS = ["PRE-A1", "A1", "A2", "B1", "B2", "C1", "C2"];
  var LEVEL_NAMES = {
    "PRE-A1": "Sobrevivência", A1: "Iniciante", A2: "Elementar", B1: "Intermediário",
    B2: "Intermediário Superior", C1: "Avançado", C2: "Proficiente",
  };

  // How many exercise blocks actually exist per level (level overview
  // page + every individual lesson page combined) at the time this was
  // written — A1 has its own set of 21 lesson pages on top of the
  // level page, so it has roughly 3x the exercises of any other level.
  // "Explorer" thresholds below are ~30% of that total, so the badge
  // means about the same amount of real effort at every level instead
  // of penalizing students on the levels with less standalone content.
  // Preenchido a partir da contagem real de blocos de exercício gerados
  // (ver scripts/build_exercise_index.py) depois que Pre-A1 e A1 foram
  // escritos; os demais níveis (ainda "planned") caem no valor padrão
  // abaixo, o que é inofensivo — não há exercícios lá para contar ainda.
  var LEVEL_EXERCISE_COUNTS = { "PRE-A1": 26, A1: 64, A2: 38, B1: 36, B2: 27, C1: 17, C2: 15 };
  function explorerThreshold(level) {
    var total = LEVEL_EXERCISE_COUNTS[level] || 30;
    return Math.max(6, Math.round(total * 0.3));
  }

  /* ------------------------------------------------------------- *
   * Badge XP — the single place to tune how much bonus XP each badge
   * grants the moment it first unlocks, on top of whatever XP the
   * badge's underlying activity already earned (e.g. an "<LEVEL>
   * Explorer" badge is a bonus for exercises that already paid out
   * XP.exercise/XP.perfectBonus each — this is separate, additional
   * XP for the milestone itself). Every id in BADGES should have an
   * entry here; badgeXp() falls back to BADGE_XP_DEFAULT for any that
   * don't, so a new badge added without remembering its XP still
   * grants something instead of silently awarding 0. See
   * docs/gamification.md "Badge XP" for the full table.
   * ------------------------------------------------------------- */
  var BADGE_XP_DEFAULT = 10;
  var BADGE_XP = {
    first_steps: 10,
    perfectionist: 10,
    streak_3: 10,
    streak_7: 15,
    streak_14: 20,
    streak_30: 30,
    placement_done: 15,
    comeback: 15,
    first_test_yourself: 15,
    // XP-milestone badges are pure recognition of XP already earned —
    // still a small bonus on top, per docs/gamification.md, rather
    // than 0.
    xp_100: 10,
    xp_250: 15,
    xp_500: 20,
    xp_1000: 25,
    no_hints_needed: 15,
    sherlock: 15,
    dictionary_power_user: 15,
    polyglot: 25,
    night_owl: 10,
    early_bird: 10,
    // Not a BADGES entry (see maybeCompleteTopic() / state.topicsCompleted),
    // but shares this same config object per docs/gamification.md.
    topic_complete: 20,
  };
  LEVELS.forEach(function (l) { BADGE_XP[l.toLowerCase() + "_explorer"] = 20; });

  function badgeXp(id) {
    return typeof BADGE_XP[id] === "number" ? BADGE_XP[id] : BADGE_XP_DEFAULT;
  }

  /* ------------------------------------------------------------- *
   * Badge definitions — data-driven. `check(state)` returns true
   * once the badge should be (or stay) unlocked. Adding a badge is
   * adding one object here; see docs/gamification.md.
   * ------------------------------------------------------------- */
  var BADGES = [
    {
      id: "first_steps", icon: "🌱", name: "Primeiros Passos",
      desc: "Complete seu primeiro exercício.",
      check: function (s) { return countExercisesDone(s) >= 1; },
    },
    {
      id: "perfectionist", icon: "🎯", name: "Perfeccionista",
      desc: "Acerte 100% em um exercício.",
      check: function (s) { return countPerfect(s) >= 1; },
    },
    {
      id: "streak_3", icon: "🔥", name: "Sequência de 3 Dias",
      desc: "Pratique 3 dias seguidos.",
      check: function (s) { return s.streak.count >= 3; },
    },
    {
      id: "streak_7", icon: "🔥", name: "Sequência de 7 Dias",
      desc: "Pratique 7 dias seguidos.",
      check: function (s) { return s.streak.count >= 7; },
    },
    {
      id: "placement_done", icon: "🧭", name: "Conheça Seu Nível",
      desc: "Complete o Teste de Nivelamento.",
      check: function (s) { return !!s.pagesCompleted.placement; },
    },
    {
      id: "streak_14", icon: "🔥", name: "Sequência de 14 Dias",
      desc: "Pratique 14 dias seguidos.",
      check: function (s) { return s.streak.count >= 14; },
    },
    {
      id: "streak_30", icon: "🔥", name: "Sequência de 30 Dias",
      desc: "Pratique 30 dias seguidos.",
      check: function (s) { return s.streak.count >= 30; },
    },
    {
      id: "comeback", icon: "🔄", name: "Por Cima da Queda",
      desc: "Volte depois de quebrar uma sequência e complete outro exercício.",
      check: function (s) { return !!(s.streak && s.streak.brokenOnce); },
    },
    {
      id: "first_test_yourself", icon: "📝", name: "Teste Você Mesmo, Testado",
      desc: "Complete totalmente uma página de Teste Você Mesmo pela primeira vez.",
      check: function (s) {
        return Object.keys(s.pagesCompleted).some(function (k) { return k.indexOf("test-yourself:") === 0; });
      },
    },
    {
      id: "xp_100", icon: "⭐", name: "100 XP",
      desc: "Ganhe 100 XP no total.",
      check: function (s) { return s.xp >= 100; },
    },
    {
      id: "xp_250", icon: "🌟", name: "250 XP",
      desc: "Ganhe 250 XP no total.",
      check: function (s) { return s.xp >= 250; },
    },
    {
      id: "xp_500", icon: "💫", name: "500 XP",
      desc: "Ganhe 500 XP no total.",
      check: function (s) { return s.xp >= 500; },
    },
    {
      id: "xp_1000", icon: "👑", name: "1000 XP",
      desc: "Ganhe 1000 XP no total.",
      check: function (s) { return s.xp >= 1000; },
    },
    {
      id: "no_hints_needed", icon: "💎", name: "Sem Precisar de Dicas",
      desc: "Acerte 100% em 5 exercícios diferentes.",
      check: function (s) { return countPerfect(s) >= 5; },
    },
    {
      id: "sherlock", icon: "🕵️", name: "Detetive das Palavras",
      desc: "Consulte sua primeira palavra no dicionário.",
      check: function (s) { return (s.dictionaryUses || 0) >= 1; },
    },
    {
      id: "dictionary_power_user", icon: "📚", name: "Fera do Dicionário",
      desc: "Consulte 10 palavras no dicionário.",
      check: function (s) { return (s.dictionaryUses || 0) >= 10; },
    },
    {
      // Deliberately keyed off real learning activity per level
      // (countLevelsWithActivity() below reads levelStats[level]
      // .exercisesDone, nothing else) — NOT s.dictionaryUses, which
      // only feeds "sherlock"/"dictionary_power_user" above. Looking
      // up any number of words, on any number of pages, can never
      // unlock this on its own: exercisesDone only ever increments
      // inside recordExerciseResult()'s "first time this exercise id
      // has been submitted" branch, a completely separate code path
      // from recordDictionaryUse(). If you're editing this, keep that
      // separation — see docs/gamification.md's Polyglot Path row.
      id: "polyglot", icon: "🌍", name: "Caminho Poliglota",
      desc: "Complete pelo menos um exercício em 3 níveis diferentes.",
      check: function (s) { return countLevelsWithActivity(s) >= 3; },
    },
    {
      id: "night_owl", icon: "🦉", name: "Coruja Noturna",
      desc: "Complete um exercício entre meia-noite e 5h (pelo relógio do seu aparelho).",
      check: function (s) { return !!(s.timeFlags && s.timeFlags.nightOwl); },
    },
    {
      id: "early_bird", icon: "🐦", name: "Madrugador",
      desc: "Complete um exercício entre 5h e 7h (pelo relógio do seu aparelho).",
      check: function (s) { return !!(s.timeFlags && s.timeFlags.earlyBird); },
    },
  ].concat(LEVELS.map(function (level) {
    var threshold = explorerThreshold(level);
    return {
      id: level.toLowerCase() + "_explorer",
      icon: "🏅",
      name: "Exploradora(or) " + level,
      desc: "Complete " + threshold + " exercícios no nível " + level + " (" + LEVEL_NAMES[level] + ").",
      level: level,
      threshold: threshold,
      check: function (s) {
        return ((s.levelStats[level] && s.levelStats[level].exercisesDone) || 0) >= threshold;
      },
    };
  }));

  function countExercisesDone(state) {
    var n = 0;
    for (var id in state.exercises) if (state.exercises.hasOwnProperty(id)) n++;
    return n;
  }
  function countPerfect(state) {
    var n = 0;
    for (var id in state.exercises) {
      if (state.exercises.hasOwnProperty(id) && state.exercises[id].perfect) n++;
    }
    return n;
  }

  // How many different levels have at least one completed exercise —
  // used by the "polyglot" badge.
  function countLevelsWithActivity(state) {
    var n = 0;
    LEVELS.forEach(function (l) {
      if (state.levelStats[l] && state.levelStats[l].exercisesDone > 0) n++;
    });
    return n;
  }

  // True once the student has any progress worth showing (xp, a
  // recorded exercise even if it somehow awarded 0 xp, or a badge —
  // e.g. "sherlock" can be earned from dictionary use alone, with no
  // exercises or XP yet). Drives whether the header pill is shown at
  // all — see renderToggle().
  function hasProgress(state) {
    return state.xp > 0 || countExercisesDone(state) > 0 || state.badges.length > 0;
  }

  /* ------------------------------------------------------------- *
   * Storage
   * ------------------------------------------------------------- */
  function defaultState() {
    var levelStats = {};
    LEVELS.forEach(function (l) { levelStats[l] = { xp: 0, exercisesDone: 0 }; });
    return {
      version: SCHEMA_VERSION,
      xp: 0,
      streak: { count: 0, lastActiveDate: "", brokenOnce: false },
      badges: [],
      exercises: {},
      levelStats: levelStats,
      pagesCompleted: {}, // e.g. { "test-yourself:A1": true, "placement": true }
      // How many times the student has looked up a word (dictionary.html's
      // outbound links, or the floating dict-widget's live lookup) — see
      // recordDictionaryUse() below and the "sherlock" / "dictionary_power_user" badges.
      dictionaryUses: 0,
      // One entry per fully-completed lesson/topic page, keyed by
      // "<LEVEL>:<slug>" (derived from the URL — see detectPageKind()/
      // maybeCompleteTopic()). Not part of the fixed BADGES catalog
      // below since the set of topics grows as lessons are added; see
      // docs/gamification.md "Topic badges" for why these are tracked
      // separately from BADGES.
      topicsCompleted: {},
      // Set once, opportunistically, the first time an exercise is
      // graded inside each time-of-day window — see recordExerciseResult().
      timeFlags: {}, // { nightOwl: true, earlyBird: true }
    };
  }

  // Local storage can throw (private browsing, quota, disabled) —
  // every call is wrapped so a storage failure never breaks grading
  // or the rest of the page.
  function loadState() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      var parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== SCHEMA_VERSION) return defaultState();
      // Merge onto a fresh default so any fields added later (or a level
      // added to LEVELS) are always present, even for an older save.
      var base = defaultState();
      base.xp = typeof parsed.xp === "number" ? parsed.xp : 0;
      base.streak = parsed.streak || base.streak;
      base.badges = Array.isArray(parsed.badges) ? parsed.badges : [];
      base.exercises = parsed.exercises || {};
      base.pagesCompleted = parsed.pagesCompleted || {};
      base.dictionaryUses = typeof parsed.dictionaryUses === "number" ? parsed.dictionaryUses : 0;
      base.topicsCompleted = parsed.topicsCompleted || {};
      base.timeFlags = parsed.timeFlags || {};
      Object.keys(parsed.levelStats || {}).forEach(function (l) {
        if (base.levelStats[l]) base.levelStats[l] = parsed.levelStats[l];
      });
      return base;
    } catch (e) {
      return defaultState();
    }
  }

  function saveState(state) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      // Storage full/blocked — progress just won't persist this run.
    }
  }

  /* ------------------------------------------------------------- *
   * Streak (calendar day, based on the student's own device clock)
   * ------------------------------------------------------------- */
  function todayStr() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }
  function daysBetween(a, b) {
    var msPerDay = 24 * 60 * 60 * 1000;
    var da = new Date(a + "T00:00:00");
    var db = new Date(b + "T00:00:00");
    return Math.round((db - da) / msPerDay);
  }

  // Returns { isNewDay: bool } and mutates state.streak in place.
  function touchStreak(state) {
    var today = todayStr();
    if (state.streak.lastActiveDate === today) return { isNewDay: false };
    var hadPreviousActivity = !!state.streak.lastActiveDate;
    var gap = hadPreviousActivity ? daysBetween(state.streak.lastActiveDate, today) : null;
    if (gap === 1) {
      state.streak.count += 1;
    } else {
      // A real break (not the very first activity ever) — remembered
      // forever so the "comeback" badge can fire the moment the
      // student does one more exercise after returning. See
      // recordExerciseResult() -> evaluateBadges().
      if (hadPreviousActivity && gap > 1) state.streak.brokenOnce = true;
      state.streak.count = 1; // first-ever activity, or the streak was broken
    }
    state.streak.lastActiveDate = today;
    return { isNewDay: true };
  }

  /* ------------------------------------------------------------- *
   * XP + badge helpers
   * ------------------------------------------------------------- */
  var pendingToasts = [];

  function awardXp(state, amount, level, label) {
    if (amount <= 0) return;
    state.xp += amount;
    if (level && state.levelStats[level]) state.levelStats[level].xp += amount;
    pendingToasts.push({ kind: "xp", text: "+" + amount + " XP" + (label ? " · " + label : "") });
  }

  // Mutates state.xp (and, for the per-level "<LEVEL> Explorer" badges,
  // that level's levelStats.xp) by the badge's configured bonus —
  // without pushing its own toast, unlike awardXp() above, so the
  // caller (evaluateBadges()) can fold the amount into a single
  // "<Badge name> unlocked · +N XP" toast instead of two separate
  // pop-ups for one event. Returns the amount actually granted (0 if
  // this badge isn't configured for a bonus) so the caller knows
  // whether to mention XP in that toast at all.
  function grantBadgeXp(state, badge) {
    var amount = badgeXp(badge.id);
    if (amount <= 0) return 0;
    state.xp += amount;
    if (badge.level && state.levelStats[badge.level]) state.levelStats[badge.level].xp += amount;
    return amount;
  }

  function evaluateBadges(state) {
    BADGES.forEach(function (b) {
      // This guard is what makes badge XP a strictly one-time grant —
      // once b.id is in state.badges, evaluateBadges() (called after
      // every exercise, dictionary use, test/placement completion, and
      // reload) skips this badge for good, so grantBadgeXp() below can
      // never run twice for the same badge.
      if (state.badges.indexOf(b.id) !== -1) return;
      if (!b.check(state)) return;
      state.badges.push(b.id);
      var xpAwarded = grantBadgeXp(state, b);
      pendingToasts.push({
        kind: "badge",
        text: "Conquista desbloqueada: " + b.name + (xpAwarded > 0 ? " · +" + xpAwarded + " XP" : ""),
        icon: b.icon,
      });
    });
  }

  /* ------------------------------------------------------------- *
   * Page inventory — which exercise-block ids live on THIS page, so
   * we can tell when a Test Yourself page or the Placement Test has
   * been fully completed (every block on it has a recorded result),
   * without any extra per-page wiring.
   * ------------------------------------------------------------- */
  function detectPageKind() {
    var path = window.location.pathname;
    if (/test-yourself\.html$/.test(path)) return "test-yourself";
    if (/placement-test\.html$/.test(path)) return "placement";
    // A single nested lesson page (e.g. levels/a1/simple-present-i.html)
    // teaches exactly one topic — completing every exercise on it earns
    // a topic badge (see maybeCompleteTopic()). Level overview pages
    // (levels/a1.html — no nested segment) are deliberately excluded:
    // they bundle many different grammar topics on one page, so "every
    // exercise on levels/b1.html done" would be a poor stand-in for
    // "finished one topic." New lesson pages need zero code changes
    // here to get topic badges — this is pure URL-shape detection.
    if (/\/levels\/[^/]+\/[^/]+\.html$/.test(path)) return "topic";
    return "lesson";
  }

  // The filename (no extension) of the current lesson page — the
  // stable per-topic id half of "<LEVEL>:<slug>" in state.topicsCompleted.
  function topicSlug() {
    var m = window.location.pathname.match(/\/([^/]+)\.html$/);
    return m ? m[1] : "";
  }

  // "simple-present-i" -> "Simple Present I". Only used for display;
  // doesn't need to be perfect for every possible slug, just readable.
  function slugToTitle(slug) {
    return slug.replace(/-/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  function pageInventory() {
    var ids = [];
    document.querySelectorAll(".exercise-block script.exercise-data").forEach(function (scriptEl) {
      try {
        var data = JSON.parse(scriptEl.textContent);
        if (data && data.id && data.type !== "writing") ids.push(data.id);
      } catch (e) { /* ignore malformed block, doesn't block the rest */ }
    });
    return ids;
  }

  function maybeCompletePage(state, pageKind, level, inventory) {
    if (!inventory.length) return;
    if (pageKind === "topic") {
      maybeCompleteTopic(state, level, inventory);
      return;
    }
    if (pageKind === "lesson") return;
    var key = pageKind === "placement" ? "placement" : "test-yourself:" + (level || "");
    if (state.pagesCompleted[key]) return;
    var allDone = inventory.every(function (id) { return !!state.exercises[id]; });
    if (!allDone) return;
    recordTestProgressInternal(state, { type: pageKind, level: level });
  }

  // Awards a one-off "topic badge" the first time every exercise on a
  // single-topic lesson page has been completed — separate from the
  // fixed BADGES catalog (see the "topicsCompleted" comment in
  // defaultState()) precisely so adding a new lesson page never
  // requires touching this file. Guarded the same way page-completion
  // is (state.topicsCompleted[topicId]), so retries never re-award it.
  function maybeCompleteTopic(state, level, inventory) {
    var slug = topicSlug();
    if (!slug) return;
    var topicId = (level || "?") + ":" + slug;
    if (state.topicsCompleted[topicId]) return;
    var allDone = inventory.every(function (id) { return !!state.exercises[id]; });
    if (!allDone) return;
    var name = (level ? level + " · " : "") + slugToTitle(slug);
    state.topicsCompleted[topicId] = { name: name, level: level || "", awardedAt: todayStr() };
    // Same one-time XP-bonus pattern as evaluateBadges()/grantBadgeXp()
    // — guarded by the topicsCompleted check above, so this can't
    // double-award on a retry any more than a real badge can.
    var xpAwarded = badgeXp("topic_complete");
    if (xpAwarded > 0) {
      state.xp += xpAwarded;
      if (level && state.levelStats[level]) state.levelStats[level].xp += xpAwarded;
    }
    pendingToasts.push({
      kind: "badge",
      text: "Tópico concluído: " + name + (xpAwarded > 0 ? " · +" + xpAwarded + " XP" : ""),
      icon: "📘",
    });
  }

  function recordTestProgressInternal(state, opts) {
    var type = opts.type;
    var level = opts.level;
    var key = type === "placement" ? "placement" : "test-yourself:" + (level || "");
    if (state.pagesCompleted[key]) return; // already awarded, never twice
    state.pagesCompleted[key] = true;
    if (type === "placement") {
      awardXp(state, XP.placement, null, "Teste de Nivelamento concluído");
    } else {
      awardXp(state, XP.testYourself, level, (level || "") + " — Teste Você Mesmo concluído");
    }
    evaluateBadges(state);
  }

  /* ------------------------------------------------------------- *
   * Public API
   * ------------------------------------------------------------- */
  function recordExerciseResult(opts) {
    opts = opts || {};
    var exerciseId = opts.exerciseId;
    if (!exerciseId) return getState();
    var level = (opts.level || "").toUpperCase();
    var total = typeof opts.total === "number" ? opts.total : 0;
    var correct = typeof opts.correct === "number" ? opts.correct : 0;
    var perfect = typeof opts.perfect === "boolean" ? opts.perfect : (total > 0 && correct === total);

    var state = loadState();
    touchStreakAndDailyBonus(state);

    var existing = state.exercises[exerciseId];
    if (!existing) {
      // First time this exact exercise block has ever been submitted
      // (in this browser) — award XP once, then remember it forever.
      awardXp(state, XP.exercise, level, "Exercício concluído");
      if (perfect) awardXp(state, XP.perfectBonus, level, "Pontuação perfeita");
      state.exercises[exerciseId] = { bestCorrect: correct, total: total, xpAwarded: true, perfect: perfect };
      if (level && state.levelStats[level]) state.levelStats[level].exercisesDone += 1;
    } else {
      // Retry: never re-award XP, just keep the best result on file
      // so badges/stats reflect genuine best performance.
      existing.bestCorrect = Math.max(existing.bestCorrect, correct);
      existing.total = total || existing.total;
      existing.perfect = existing.perfect || perfect;
    }

    touchTimeOfDayFlags(state);
    evaluateBadges(state);

    var pageKind = detectPageKind();
    if (pageKind !== "lesson") maybeCompletePage(state, pageKind, level, pageInventory());

    saveState(state);
    flushUI(state);
    return getStateFrom(state);
  }

  function recordTestProgress(opts) {
    opts = opts || {};
    var state = loadState();
    touchStreakAndDailyBonus(state);
    recordTestProgressInternal(state, opts);
    saveState(state);
    flushUI(state);
    return getStateFrom(state);
  }

  // Opportunistically records which time-of-day windows the student has
  // ever graded an exercise in, based on the device's own clock — pure
  // fire-once flags read back by the "night_owl" / "early_bird" badge
  // checks so those checks stay a pure function of state (per
  // docs/gamification.md), rather than reaching for Date.now() themselves.
  function touchTimeOfDayFlags(state) {
    var hour = new Date().getHours();
    if (hour >= 0 && hour < 5) state.timeFlags.nightOwl = true;
    if (hour >= 5 && hour < 7) state.timeFlags.earlyBird = true;
  }

  function touchStreakAndDailyBonus(state) {
    var wasCount = state.streak.count;
    var res = touchStreak(state);
    if (res.isNewDay) {
      pendingToasts.push({ kind: "streak", text: "Dia " + state.streak.count + " de sequência!" });
      if (XP.dailyBonus > 0 && wasCount > 0) awardXp(state, XP.dailyBonus, null, "Bônus diário");
    }
  }

  // Called from the dictionary UI (assets/js/dictionary.js's outbound
  // lookup links, assets/js/dict-widget.js's live lookup) every time
  // the student actually looks a word up — not just on page load. Pure
  // badge-tracking: no XP, no streak/daily-bonus touch, since browsing
  // the dictionary isn't itself a graded practice activity.
  function recordDictionaryUse() {
    var state = loadState();
    state.dictionaryUses = (state.dictionaryUses || 0) + 1;
    evaluateBadges(state);
    saveState(state);
    flushUI(state);
    return getStateFrom(state);
  }

  function getStateFrom(state) {
    return JSON.parse(JSON.stringify(state));
  }
  function getState() {
    return getStateFrom(loadState());
  }

  function resetProgress() {
    try { window.localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    // Mastery/spaced-repetition data (assets/js/mastery.js) is a
    // separate module with its own storage key, but from the student's
    // point of view "reset my progress" should mean everything --
    // guarded since mastery.js isn't loaded on every page.
    if (window.MasteryTracker && typeof window.MasteryTracker.resetMastery === "function") {
      window.MasteryTracker.resetMastery();
    }
    flushUI(loadState());
  }

  /* ------------------------------------------------------------- *
   * UI — header widget (button + dropdown panel) and toasts.
   * Injected purely in JS so no per-page markup is needed beyond the
   * <script> tag; styling lives in assets/css/components.css under
   * "Progress / gamification widget".
   * ------------------------------------------------------------- */
  var els = null; // lazily built DOM refs

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      if (k === "class") node.className = attrs[k];
      else if (k === "html") node.innerHTML = attrs[k];
      else if (k === "text") node.textContent = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }

  function flameIcon(flameClass) {
    var s = el("span", { "aria-hidden": "true", class: flameClass });
    s.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2s6 5.5 6 11a6 6 0 1 1-12 0c0-1.6.7-2.8 1.5-4 .3 1.2 1 1.8 1.7 1.8C10.2 10.8 9.5 8 12 2Z"/></svg>';
    return s;
  }

  // Closes the mobile off-canvas nav (#primary-nav, toggled by main.js's
  // [data-nav-toggle]) — used when the "Progress" row inside that menu
  // is tapped, so the panel opens over a clean page instead of behind
  // the still-open menu. Reads the same elements/classes main.js's
  // initMobileNav() uses rather than sharing state with it, since the
  // two files are independent and main.js exposes nothing globally.
  function closeMobileNav() {
    var nav = document.getElementById("primary-nav");
    var navToggle = document.querySelector("[data-nav-toggle]");
    if (nav) nav.classList.remove("is-open");
    if (navToggle) navToggle.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
  }

  function buildWidget() {
    var navUtility = document.querySelector(".nav-utility");
    var navList = document.querySelector("#primary-nav .primary-nav__list");
    var dictLink = navList && navList.querySelector('a[href$="dicionario.html"]');
    var dictItem = dictLink ? dictLink.closest("li") : null;

    // Desktop header pill — unchanged in spirit, but now hidden on
    // mobile widths (see .progress-toggle--pill in components.css) so
    // it never competes with search/theme/hamburger for room there;
    // the mobile-menu row below takes over at that width instead.
    var toggle = el("button", {
      type: "button",
      class: "progress-toggle progress-toggle--pill",
      "aria-haspopup": "dialog",
      "aria-expanded": "false",
      "aria-label": "Seu progresso: XP, sequência e conquistas",
    });
    var xpEl = el("span", { class: "progress-toggle__xp", text: "0 XP" });
    toggle.appendChild(flameIcon("progress-toggle__flame"));
    var streakEl = el("span", { class: "progress-toggle__streak", text: "0" });
    toggle.appendChild(streakEl);
    toggle.appendChild(el("span", { class: "progress-toggle__dot", "aria-hidden": "true", text: "·" }));
    toggle.appendChild(xpEl);

    // Mobile menu row — lives inside #primary-nav's own list, right
    // after Dictionary, so on mobile (where the pill above is hidden)
    // Progress/XP is just another item in the ☰ menu instead of a
    // separate header control. Built once here and reused across the
    // "no progress yet" (hidden) and "has progress" (visible) states —
    // see renderToggle() — so its position in the menu never changes,
    // only its visibility does (the mobile-placement regression this
    // fixes: the pill used to be the only control, and it lived in the
    // cramped header bar on every width).
    var menuItem = null, menuToggle = null, menuStreakEl = null, menuXpEl = null;
    if (dictItem) {
      menuToggle = el("button", {
        type: "button",
        class: "progress-menu-toggle",
        "aria-haspopup": "dialog",
        "aria-expanded": "false",
      });
      menuToggle.appendChild(el("span", { class: "progress-menu-toggle__label", text: "Progresso" }));
      var stat = el("span", { class: "progress-menu-toggle__stat" });
      stat.appendChild(flameIcon("progress-menu-toggle__flame"));
      menuStreakEl = el("span", { class: "progress-menu-toggle__streak", text: "0" });
      stat.appendChild(menuStreakEl);
      stat.appendChild(el("span", { class: "progress-menu-toggle__dot", "aria-hidden": "true", text: "·" }));
      menuXpEl = el("span", { class: "progress-menu-toggle__xp", text: "0 XP" });
      stat.appendChild(menuXpEl);
      menuToggle.appendChild(stat);

      menuItem = el("li", { class: "primary-nav__item primary-nav__item--progress" }, [menuToggle]);
      dictItem.insertAdjacentElement("afterend", menuItem);
    }

    var panel = el("div", { class: "progress-panel", role: "dialog", "aria-label": "Seu progresso" });
    panel.hidden = true;

    if (navUtility) {
      navUtility.insertBefore(toggle, navUtility.firstChild);
      navUtility.parentNode.style.position = navUtility.parentNode.style.position || "relative";
      document.body.appendChild(panel);
    } else {
      // Defensive fallback for any page without the standard header.
      toggle.classList.add("progress-toggle--floating");
      toggle.classList.remove("progress-toggle--pill");
      document.body.appendChild(toggle);
      document.body.appendChild(panel);
    }

    function positionPanel() {
      panel.classList.remove("progress-panel--sheet");
      var r = toggle.getBoundingClientRect();
      panel.style.position = "fixed";
      panel.style.top = Math.round(r.bottom + 8) + "px";
      var right = Math.max(8, window.innerWidth - r.right);
      panel.style.right = Math.round(right) + "px";
      panel.style.left = "auto";
    }

    // The mobile menu row sits inside #primary-nav, which closeMobileNav()
    // hides immediately — anchoring the panel to its (about to vanish)
    // position wouldn't work, so it's shown as a centered "sheet"
    // instead (see .progress-panel--sheet in components.css).
    function positionPanelAsSheet() {
      panel.style.position = "";
      panel.style.top = "";
      panel.style.right = "";
      panel.style.left = "";
      panel.classList.add("progress-panel--sheet");
    }

    function open(fromMenu) {
      renderPanel(loadState()); // always fresh, never stale content
      panel.hidden = false;
      if (fromMenu) {
        closeMobileNav();
        positionPanelAsSheet();
      } else {
        positionPanel();
        window.addEventListener("resize", positionPanel);
      }
      toggle.setAttribute("aria-expanded", "true");
      if (menuToggle) menuToggle.setAttribute("aria-expanded", "true");
      document.addEventListener("click", onDocClick, true);
    }
    function close() {
      panel.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
      if (menuToggle) menuToggle.setAttribute("aria-expanded", "false");
      document.removeEventListener("click", onDocClick, true);
      window.removeEventListener("resize", positionPanel);
    }
    function onDocClick(e) {
      if (panel.contains(e.target) || toggle.contains(e.target)) return;
      if (menuToggle && menuToggle.contains(e.target)) return;
      close();
    }
    toggle.addEventListener("click", function () {
      if (panel.hidden) open(false); else close();
    });
    if (menuToggle) {
      menuToggle.addEventListener("click", function () {
        if (panel.hidden) open(true); else close();
      });
    }
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !panel.hidden) close();
    });

    var toastHost = el("div", { class: "xp-toast-host", "aria-live": "polite" });
    document.body.appendChild(toastHost);

    els = {
      toggle: toggle, xpEl: xpEl, streakEl: streakEl,
      menuItem: menuItem, menuToggle: menuToggle, menuStreakEl: menuStreakEl, menuXpEl: menuXpEl,
      panel: panel, toastHost: toastHost, close: close,
    };
  }

  function badgeGridHtml(state) {
    return BADGES.map(function (b) {
      var earned = state.badges.indexOf(b.id) !== -1;
      return (
        '<li class="badge-chip' + (earned ? " is-earned" : "") + '" title="' + escapeHtml(b.desc) + '">' +
        '<span class="badge-chip__icon" aria-hidden="true">' + (earned ? b.icon : "🔒") + "</span>" +
        '<span class="badge-chip__name">' + escapeHtml(b.name) + "</span>" +
        "</li>"
      );
    }).join("");
  }

  function escapeHtml(s) {
    var d = document.createElement("div");
    d.textContent = String(s || "");
    return d.innerHTML;
  }

  function topicNames(state) {
    return Object.keys(state.topicsCompleted).map(function (id) { return state.topicsCompleted[id].name; }).sort();
  }

  // Compact one-line summary for the header panel (which has limited
  // room) — the full per-topic list lives on progress.html instead;
  // see topicListHtml().
  function topicSummaryHtml(state) {
    var n = topicNames(state).length;
    if (!n) return "";
    return '<p class="progress-panel__hint">📘 ' + n + " tópico" + (n === 1 ? "" : "s") + " concluído" + (n === 1 ? "" : "s") + ".</p>";
  }

  // Full list, used on progress.html's dedicated "Topics" section.
  function topicListHtml(state) {
    var names = topicNames(state);
    if (!names.length) return '<p class="progress-panel__hint">Nenhum tópico concluído ainda — termine todos os exercícios de uma página de lição para ganhar um.</p>';
    return '<ul class="topic-list">' + names.map(function (n) { return "<li>" + escapeHtml(n) + "</li>"; }).join("") + "</ul>";
  }

  function renderPanel(state) {
    if (!els) return;
    var earnedCount = state.badges.length;
    var levelRows = LEVELS.map(function (l) {
      var ls = state.levelStats[l] || { xp: 0, exercisesDone: 0 };
      var threshold = explorerThreshold(l);
      var pct = Math.min(100, Math.round((ls.exercisesDone / threshold) * 100));
      return (
        '<div class="progress-panel__level-row">' +
        '<div class="progress-label"><span>' + l + "</span><span>" + ls.exercisesDone + " done · " + ls.xp + " XP</span></div>" +
        '<div class="progress-track"><div class="progress-track__fill" style="width:' + pct + '%"></div></div>' +
        "</div>"
      );
    }).join("");

    els.panel.innerHTML =
      '<div class="progress-panel__head">' +
      '<div><strong>' + state.xp + ' XP</strong><span class="progress-panel__streak-label">🔥 ' + state.streak.count + '-day streak</span></div>' +
      '<button type="button" class="progress-panel__close" aria-label="Fechar">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>' +
      "</div>" +
      '<p class="progress-panel__hint">O progresso é salvo só neste navegador — não se perde ao atualizar a página, e não precisa de conta.</p>' +
      '<div class="progress-panel__levels">' + levelRows + "</div>" +
      topicSummaryHtml(state) +
      '<p class="progress-panel__badges-label">Conquistas — ' + earnedCount + " de " + BADGES.length + " desbloqueadas</p>" +
      '<ul class="badge-grid">' + badgeGridHtml(state) + "</ul>" +
      '<a class="btn btn--ghost btn--small progress-panel__link" href="' + progressPageHref() + '">Ver progresso completo</a>';

    var closeBtn = els.panel.querySelector(".progress-panel__close");
    if (closeBtn) closeBtn.addEventListener("click", function () {
      els.panel.hidden = true;
      els.toggle.setAttribute("aria-expanded", "false");
    });
  }

  function progressPageHref() {
    // Works whether this page is at the site root, one level deep
    // (levels/a1.html) or two levels deep (levels/a1/xyz.html).
    var depth = (window.location.pathname.match(/\/levels\/[^/]+\/[^/]+$/)) ? 2
      : (window.location.pathname.match(/\/levels\/[^/]+$/)) ? 1 : 0;
    return (depth === 2 ? "../../" : depth === 1 ? "../" : "") + "progresso.html";
  }

  function renderToggle(state) {
    if (!els) return;
    els.xpEl.textContent = state.xp + " XP";
    els.streakEl.textContent = String(state.streak.count);
    els.toggle.classList.toggle("has-streak", state.streak.count > 0);
    // The pill/menu row are mounted on every page with the standard
    // header (see the <script> tags added alongside main.js), but stay
    // hidden until the student has any real progress, so they don't
    // clutter purely informational pages for a brand-new visitor. Once
    // shown, they never disappear again on navigation/reload — only a
    // reset (resetProgress) or clearing storage takes it back to "no
    // progress yet" and hides them. Visibility changes here; DOM
    // position never does — the mobile row is always the item right
    // after Dictionary in #primary-nav, whether hidden or shown.
    var active = hasProgress(state);
    els.toggle.hidden = !active;
    if (els.menuItem) els.menuItem.hidden = !active;
    if (els.menuStreakEl) els.menuStreakEl.textContent = String(state.streak.count);
    if (els.menuXpEl) els.menuXpEl.textContent = state.xp + " XP";
    if (els.menuToggle) {
      els.menuToggle.classList.toggle("has-streak", state.streak.count > 0);
      els.menuToggle.setAttribute(
        "aria-label",
        "Seu progresso: " + state.xp + " XP, sequência de " + state.streak.count + " dias"
      );
    }
    if (!active && !els.panel.hidden) els.close();
  }

  var prefersReducedMotion = function () {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  };

  // Small golden sparkle/firework burst shown behind+around a toast.
  // Purely decorative (aria-hidden) and skipped entirely under
  // prefers-reduced-motion — see docs/gamification.md.
  function buildBurst(kind) {
    var burst = el("div", { class: "xp-burst xp-burst--" + kind, "aria-hidden": "true" });
    var count = kind === "badge" ? 12 : kind === "streak" ? 8 : 6;
    for (var i = 0; i < count; i++) {
      var spark = document.createElement("span");
      spark.className = "xp-burst__spark";
      spark.style.setProperty("--angle", Math.round((360 / count) * i + (Math.random() * 20 - 10)) + "deg");
      spark.style.setProperty("--delay", Math.round(Math.random() * 90) + "ms");
      burst.appendChild(spark);
    }
    return burst;
  }

  function showToast(item) {
    if (!els) return;
    var node = el("div", { class: "xp-toast xp-toast--" + item.kind });
    if (!prefersReducedMotion()) node.appendChild(buildBurst(item.kind));
    if (item.icon) node.appendChild(el("span", { class: "xp-toast__icon", "aria-hidden": "true", text: item.icon }));
    node.appendChild(el("span", { text: item.text }));

    var hideTimer;
    var dismissed = false;
    function dismiss() {
      if (dismissed) return;
      dismissed = true;
      clearTimeout(hideTimer);
      node.classList.remove("is-visible");
      setTimeout(function () { node.remove(); }, TOAST_EXIT_MS);
    }
    // Dismissible early on click/tap — useful now that toasts stay up
    // for several seconds. The host itself stays pointer-events:none
    // (see CSS) so the toasts never block clicks elsewhere on the page.
    node.addEventListener("click", dismiss);

    els.toastHost.appendChild(node);
    requestAnimationFrame(function () { node.classList.add("is-visible"); });
    hideTimer = setTimeout(dismiss, TOAST_VISIBLE_MS);
  }

  // Toasts earned while the tab is backgrounded (document.hidden) wait
  // here instead of animating in unseen — background timers are also
  // throttled by the browser, so a toast's ~7s visible window could
  // silently elapse before the student ever switches back. Drained in
  // order, spaced by VISIBILITY_QUEUE_GAP_MS, the moment the tab
  // becomes visible again (see the "visibilitychange" listener below).
  var visibilityQueue = [];
  var VISIBILITY_QUEUE_GAP_MS = 700;
  var isDrainingVisibilityQueue = false;

  function isPageVisible() {
    // Only browsers old enough to lack the Page Visibility API entirely
    // hit the `typeof` branch — treat "can't tell" as visible so this
    // never gets stuck holding toasts back forever.
    return typeof document.visibilityState !== "string" || document.visibilityState === "visible";
  }

  function drainVisibilityQueue() {
    if (isDrainingVisibilityQueue || !visibilityQueue.length) return;
    isDrainingVisibilityQueue = true;
    var queue = visibilityQueue;
    visibilityQueue = [];
    queue.forEach(function (item, i) {
      setTimeout(function () { showToast(item); }, i * VISIBILITY_QUEUE_GAP_MS);
    });
    setTimeout(function () { isDrainingVisibilityQueue = false; }, queue.length * VISIBILITY_QUEUE_GAP_MS);
  }

  document.addEventListener("visibilitychange", function () {
    if (isPageVisible()) drainVisibilityQueue();
  });

  function flushUI(state) {
    if (!els) return; // widget not on this page for some reason
    renderToggle(state);
    if (!els.panel.hidden) renderPanel(state);
    var queue = pendingToasts;
    pendingToasts = [];
    if (!queue.length) return;
    if (isPageVisible()) {
      // Current behavior, unchanged: pop them in with a short stagger.
      queue.forEach(function (item, i) {
        setTimeout(function () { showToast(item); }, i * 260);
      });
    } else {
      // Hold everything for drainVisibilityQueue() instead — badges/XP
      // are still recorded and saved normally either way; only the
      // toast + fireworks are deferred.
      visibilityQueue.push.apply(visibilityQueue, queue);
    }
  }

  /* ------------------------------------------------------------- *
   * Full progress page (progress.html) — optional; only does
   * anything if that page's specific containers are present, so this
   * is a harmless no-op everywhere else.
   * ------------------------------------------------------------- */
  function renderProgressPage() {
    var summaryEl = document.getElementById("progress-summary");
    var levelsEl = document.getElementById("progress-levels");
    var badgesEl = document.getElementById("progress-badges");
    var topicsEl = document.getElementById("progress-topics");
    if (!summaryEl && !levelsEl && !badgesEl && !topicsEl) return;

    function render() {
      var state = loadState();
      if (summaryEl) {
        summaryEl.innerHTML =
          '<div class="progress-stat"><strong>' + state.xp + '</strong><span>XP total</span></div>' +
          '<div class="progress-stat"><strong>' + state.streak.count + '</strong><span>Dias de sequência</span></div>' +
          '<div class="progress-stat"><strong>' + state.badges.length + " / " + BADGES.length + '</strong><span>Conquistas desbloqueadas</span></div>' +
          '<div class="progress-stat"><strong>' + countExercisesDone(state) + '</strong><span>Exercícios concluídos</span></div>';
      }
      if (levelsEl) {
        levelsEl.innerHTML = LEVELS.map(function (l) {
          var ls = state.levelStats[l] || { xp: 0, exercisesDone: 0 };
          var threshold = explorerThreshold(l);
          var pct = Math.min(100, Math.round((ls.exercisesDone / threshold) * 100));
          return (
            '<div class="progress-panel__level-row">' +
            '<div class="progress-label"><span>' + l + " — " + LEVEL_NAMES[l] + "</span><span>" + ls.exercisesDone + " done · " + ls.xp + " XP</span></div>" +
            '<div class="progress-track"><div class="progress-track__fill" style="width:' + pct + '%"></div></div>' +
            "</div>"
          );
        }).join("");
      }
      if (badgesEl) {
        badgesEl.innerHTML = badgeGridHtml(state);
      }
      if (topicsEl) {
        topicsEl.innerHTML = topicListHtml(state);
      }
    }

    render();

    var resetBtn = document.getElementById("progress-reset-btn");
    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        if (window.confirm("Zerar todo o XP, sequência e conquistas neste dispositivo? Isso não pode ser desfeito.")) {
          resetProgress();
          render();
        }
      });
    }
  }

  /* ------------------------------------------------------------- *
   * Boot
   * ------------------------------------------------------------- */
  function init() {
    buildWidget();
    renderToggle(loadState());
    renderProgressPage();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.ProgressTracker = {
    recordExerciseResult: recordExerciseResult,
    recordTestProgress: recordTestProgress,
    recordDictionaryUse: recordDictionaryUse,
    getState: getState,
    resetProgress: resetProgress,
    XP: XP,
    BADGES: BADGES,
    LEVELS: LEVELS,
    explorerThreshold: explorerThreshold,
  };
})();
