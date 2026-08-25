/*!
 * Renan, o Professor — Academia de Português Brasileiro
 * Shared site behaviour: mobile navigation, the Levels dropdown,
 * dark-mode toggling, back-to-top, and header-aware anchor scrolling.
 * Framework-free by design — keeps every page fast on GitHub Pages
 * and leaves room for future interactive exercises to add their own
 * small, scoped scripts alongside this one.
 */
(function () {
  "use strict";

  /* ---------------------------------------------------------------
     Theme (light / dark)
     Applied as early as possible via an inline snippet in <head>
     (see partials in each page) to avoid a flash of the wrong theme;
     this section only wires up the toggle button.
     --------------------------------------------------------------- */
  function initTheme() {
    var toggle = document.querySelector("[data-theme-toggle]");
    if (!toggle) return;

    toggle.addEventListener("click", function () {
      var root = document.documentElement;
      var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try {
        localStorage.setItem("theme", next);
      } catch (err) {
        /* localStorage unavailable (private mode) — theme just won't persist */
      }
      toggle.setAttribute(
        "aria-label",
        next === "dark" ? "Mudar para modo claro" : "Mudar para modo escuro"
      );
    });
  }

  /* ---------------------------------------------------------------
     Mobile navigation
     --------------------------------------------------------------- */
  function initMobileNav() {
    var toggle = document.querySelector("[data-nav-toggle]");
    var nav = document.getElementById("primary-nav");
    if (!toggle || !nav) return;

    toggle.addEventListener("click", function () {
      var isOpen = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(isOpen));
      document.body.style.overflow = isOpen ? "hidden" : "";
    });

    nav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        if (window.matchMedia("(max-width: 900px)").matches) {
          nav.classList.remove("is-open");
          toggle.setAttribute("aria-expanded", "false");
          document.body.style.overflow = "";
        }
      });
    });

    window.addEventListener("resize", function () {
      if (!window.matchMedia("(max-width: 900px)").matches) {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
        document.body.style.overflow = "";
      }
    });
  }

  /* ---------------------------------------------------------------
     "Levels" dropdown — hover works via CSS on desktop; this adds
     click/tap and keyboard support so touch and keyboard users can
     open it too, and closes it on outside click / Escape.
     --------------------------------------------------------------- */
  function initDropdown() {
    var drop = document.querySelector(".nav-drop");
    if (!drop) return;
    var toggle = drop.querySelector(".nav-drop__toggle");
    if (!toggle) return;

    function close() {
      drop.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
    }
    function open() {
      drop.classList.add("is-open");
      toggle.setAttribute("aria-expanded", "true");
    }

    toggle.addEventListener("click", function (e) {
      e.preventDefault();
      if (drop.classList.contains("is-open")) close();
      else open();
    });

    document.addEventListener("click", function (e) {
      if (!drop.contains(e.target)) close();
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        close();
        toggle.blur();
      }
    });
  }

  /* ---------------------------------------------------------------
     Back-to-top button
     --------------------------------------------------------------- */
  function initBackToTop() {
    var btn = document.querySelector("[data-back-to-top]");
    if (!btn) return;

    var toggleVisibility = function () {
      btn.classList.toggle("is-visible", window.scrollY > 480);
    };
    window.addEventListener("scroll", toggleVisibility, { passive: true });
    toggleVisibility();

    btn.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  /* ---------------------------------------------------------------
     Header-aware smooth scrolling for in-page anchors, and support
     for arriving from another page with a hash (e.g. levels/a1.html
     linking to index.html#mission).
     --------------------------------------------------------------- */
  function headerOffset() {
    var header = document.querySelector(".site-header");
    var toc = document.querySelector(".level-toc");
    var height = header ? header.offsetHeight : 0;
    if (toc) height += toc.offsetHeight;
    return height + 16;
  }

  function scrollToId(id) {
    var target = document.getElementById(id);
    if (!target) return;
    var top = target.getBoundingClientRect().top + window.pageYOffset - headerOffset();
    window.scrollTo({ top: top, behavior: "smooth" });
  }

  function initAnchorScrolling() {
    document.querySelectorAll('a[href^="#"]').forEach(function (link) {
      var href = link.getAttribute("href");
      if (!href || href === "#") return;
      link.addEventListener("click", function (e) {
        var id = href.substring(1);
        if (!document.getElementById(id)) return;
        e.preventDefault();
        scrollToId(id);
        history.pushState(null, "", href);
      });
    });

    if (window.location.hash) {
      window.addEventListener("load", function () {
        setTimeout(function () {
          scrollToId(window.location.hash.substring(1));
        }, 60);
      });
    }
  }

  /* ---------------------------------------------------------------
     Scrollspy — keeps the active link in a .level-toc[data-scrollspy]
     highlighted and horizontally scrolled into view as the page
     scrolls, so the current topic is always visible in the strip.
     --------------------------------------------------------------- */
  function initScrollspy() {
    var toc = document.querySelector(".level-toc[data-scrollspy]");
    if (!toc) return;
    var inner = toc.querySelector(".level-toc__inner");
    var links = Array.prototype.slice.call(inner.querySelectorAll("a"));
    var targets = links
      .map(function (a) {
        var id = a.getAttribute("href").replace("#", "");
        var el = document.getElementById(id);
        return el ? { link: a, el: el } : null;
      })
      .filter(Boolean);
    if (!targets.length) return;

    var ticking = false;
    function setActive() {
      var offset = headerOffset() + 4;
      var current = targets[0];
      for (var i = 0; i < targets.length; i++) {
        if (targets[i].el.getBoundingClientRect().top - offset <= 0) {
          current = targets[i];
        }
      }
      links.forEach(function (a) {
        a.classList.toggle("is-active", a === current.link);
      });
      var linkLeft = current.link.offsetLeft;
      var linkRight = linkLeft + current.link.offsetWidth;
      var viewLeft = inner.scrollLeft;
      var viewRight = viewLeft + inner.clientWidth;
      if (linkLeft < viewLeft || linkRight > viewRight) {
        inner.scrollTo({ left: linkLeft - 24, behavior: "smooth" });
      }
      ticking = false;
    }
    window.addEventListener("scroll", function () {
      if (!ticking) {
        window.requestAnimationFrame(setActive);
        ticking = true;
      }
    }, { passive: true });
    setActive();
  }

  /* ---------------------------------------------------------------
     Audio pipeline warm-up
     On a fresh page load, some browsers have a brief cold-start delay
     the first time any <audio> element plays — the underlying audio
     output device hasn't been spun up yet — which swallows the first
     second or two of playback. This is most noticeable on the first
     clip someone plays in a Listening section; every clip after it
     plays instantly because the pipeline is already warm by then.
     Priming a silent Web Audio buffer on the page's very first
     pointer/keyboard interaction warms that same shared pipeline up
     before the real click reaches an <audio>.play() call — and since
     "pointerdown" fires before "click", this finishes in time even
     when that first interaction IS the play button itself.

     The same handler also primes window.speechSynthesis (used by the
     dictionary widget's pronunciation fallback, assets/js/dict-widget.js,
     when a dictionary-provided audio clip fails to load). Browsers —
     Chrome in particular — can silently drop a speak() call that isn't
     the page's first one AND isn't made synchronously inside a user
     gesture; the widget's fallback call happens later, from an async
     "this audio clip failed to load" handler, which is neither. Making
     a throwaway speak() call right here, synchronously inside this same
     first-gesture handler, "uses up" that first/synchronous slot up
     front, so the widget's later async call is a normal subsequent call
     instead — the case every browser handles reliably. This also warms
     the voice list itself, which some browsers report empty until the
     first getVoices() call.
     --------------------------------------------------------------- */
  function initAudioUnlock() {
    var primed = false;
    function prime() {
      if (primed) return;
      primed = true;
      try {
        var Ctx = window.AudioContext || window.webkitAudioContext;
        if (Ctx) {
          var ctx = new Ctx();
          var buffer = ctx.createBuffer(1, 1, 22050);
          var source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(ctx.destination);
          if (source.start) source.start(0);
          else if (source.noteOn) source.noteOn(0);
          if (ctx.resume) ctx.resume();
        }
      } catch (err) {
        /* best-effort warm-up only — never block real playback on this */
      }
      try {
        if (window.speechSynthesis && typeof window.SpeechSynthesisUtterance === "function") {
          window.speechSynthesis.getVoices();
          var utter = new window.SpeechSynthesisUtterance(" ");
          utter.volume = 0;
          window.speechSynthesis.speak(utter);
        }
      } catch (err) {
        /* best-effort warm-up only */
      }
    }
    document.addEventListener("pointerdown", prime, { once: true, passive: true });
    document.addEventListener("touchstart", prime, { once: true, passive: true });
    document.addEventListener("keydown", prime, { once: true });
  }

  document.addEventListener("DOMContentLoaded", function () {
    initTheme();
    initMobileNav();
    initDropdown();
    initBackToTop();
    initAnchorScrolling();
    initScrollspy();
    initAudioUnlock();
  });
})();
