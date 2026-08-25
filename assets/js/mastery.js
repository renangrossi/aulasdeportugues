/*!
 * Renan, o Professor — Local Mastery & Spaced Repetition
 * ------------------------------------------------------------------
 * Offline, localStorage-only (same model as progress.js's gamification
 * layer) -- no account, no server, works identically on GitHub Pages.
 * Deliberately a separate module and a separate storage key from
 * progress.js: XP/streaks/badges answer "has the student done stuff?";
 * this answers "does the student actually still get this right?" --
 * two different questions that shouldn't share one record shape.
 *
 * Listens for the "exercise:submitted" event exercises.js already
 * dispatches (bubbles to document), reading the per-item `itemId` field
 * added to its `results` array specifically to make this possible. For
 * every graded, checkable item (see scripts/build_exercise_index.py for
 * which item types count as "checkable"), this keeps:
 *   - attempts, correctCount, incorrectCount
 *   - consecutiveCorrect (resets to 0 on any miss)
 *   - lastAttemptAt, lastCorrect
 *   - a simple SM-2-lite interval (in days) and the resulting dueAt date
 *   - masteryStatus: "new" | "learning" | "mastered"
 *
 * Mastery criterion (deliberately stricter than "got it right once"):
 * an item becomes "mastered" only after two correct attempts with at
 * least one calendar day between them (consecutiveCorrect >= 2 AND the
 * two most recent correct attempts weren't on the same day) -- matching
 * the mastery-bar-raising decision made earlier in this project's
 * curriculum audit ("correct on first attempt, on two separate
 * occasions at least N days apart", simplified here to N=1 day since a
 * self-paced learner may not return for a week).
 *
 * Public API (window.MasteryTracker):
 *   getDueItemIds()      // item ids due for review today (new + learning
 *                         // items not yet attempted, or interval elapsed)
 *   getItemMastery(id)   // read-only record for one item, or null
 *   getState()           // read-only snapshot of everything
 *   resetMastery()        // wipes local mastery data (used by progress.html)
 * ------------------------------------------------------------------ */
(function () {
  "use strict";

  // Ver o comentário equivalente em progress.js sobre o prefixo "apt_"
  // (mesma origem do GitHub Pages compartilhada com o site de inglês).
  var STORAGE_KEY = "apt_mastery";
  var SCHEMA_VERSION = 1;

  // SM-2-lite interval ladder, in days, indexed by consecutiveCorrect
  // (capped at the last value). A miss resets consecutiveCorrect to 0,
  // which resets the interval to the first rung (due again tomorrow).
  var INTERVAL_LADDER_DAYS = [1, 3, 7, 16, 35, 70];

  function todayStr() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }

  function addDays(dateStr, days) {
    var d = new Date(dateStr + "T00:00:00");
    d.setDate(d.getDate() + days);
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }

  function defaultState() {
    return { version: SCHEMA_VERSION, items: {} };
  }

  function loadState() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      var parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== SCHEMA_VERSION || !parsed.items) return defaultState();
      return parsed;
    } catch (e) {
      return defaultState();
    }
  }

  function saveState(state) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      // Storage full/blocked -- mastery just won't persist this run,
      // same fallback behavior as progress.js.
    }
  }

  function defaultItemRecord() {
    return {
      attempts: 0,
      correctCount: 0,
      incorrectCount: 0,
      consecutiveCorrect: 0,
      lastAttemptAt: null, // "YYYY-MM-DD"
      lastCorrect: null,
      dueAt: todayStr(), // new items are due immediately
      masteryStatus: "new", // "new" | "learning" | "mastered"
    };
  }

  function recordAttempt(itemId, correct) {
    if (!itemId) return;
    var state = loadState();
    var rec = state.items[itemId] || defaultItemRecord();
    var today = todayStr();
    var wasCorrectBefore = rec.lastCorrect === true && rec.lastAttemptAt !== today;

    rec.attempts += 1;
    rec.lastAttemptAt = today;
    rec.lastCorrect = correct;

    if (correct) {
      rec.correctCount += 1;
      rec.consecutiveCorrect += 1;
    } else {
      rec.incorrectCount += 1;
      rec.consecutiveCorrect = 0;
    }

    var rung = Math.min(rec.consecutiveCorrect, INTERVAL_LADDER_DAYS.length) - 1;
    var intervalDays = rung >= 0 ? INTERVAL_LADDER_DAYS[rung] : 0;
    rec.dueAt = correct ? addDays(today, intervalDays) : today; // wrong -> due again today

    if (!correct) {
      rec.masteryStatus = rec.attempts > rec.correctCount ? "learning" : "new";
    } else if (rec.consecutiveCorrect >= 2 && wasCorrectBefore) {
      // Two correct attempts, at least one of them not today -- the
      // stricter bar described above.
      rec.masteryStatus = "mastered";
    } else {
      rec.masteryStatus = "learning";
    }

    state.items[itemId] = rec;
    saveState(state);
  }

  document.addEventListener("exercise:submitted", function (e) {
    var results = (e.detail && e.detail.results) || [];
    results.forEach(function (r) {
      if (r && r.itemId) recordAttempt(r.itemId, !!r.correct);
    });
  });

  function getDueItemIds() {
    var state = loadState();
    var today = todayStr();
    return Object.keys(state.items).filter(function (id) {
      var rec = state.items[id];
      return rec.masteryStatus !== "mastered" && rec.dueAt <= today;
    });
  }

  function getItemMastery(itemId) {
    var state = loadState();
    return state.items[itemId] || null;
  }

  function getState() {
    return loadState();
  }

  function resetMastery() {
    saveState(defaultState());
  }

  window.MasteryTracker = {
    getDueItemIds: getDueItemIds,
    getItemMastery: getItemMastery,
    getState: getState,
    resetMastery: resetMastery,
  };
})();
