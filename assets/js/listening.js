/*!
 * Renan, o Professor — Leitura em voz alta (Web Speech API)
 * ------------------------------------------------------------------
 * O site em inglês usa áudio pré-gravado (.mp3) para os exercícios de
 * escuta. Aqui usamos a síntese de voz nativa do navegador
 * (window.speechSynthesis) para o mesmo papel, sem precisar gravar ou
 * hospedar um único arquivo de áudio — funciona inteiramente offline
 * depois que a página carrega, com custo zero.
 *
 * Uso: qualquer botão com o atributo [data-tts] fala o texto do seu
 * atributo `data-tts-text` (ou, se ausente, o texto de um elemento
 * apontado por `data-tts-target`, útil para "ouvir o parágrafo
 * inteiro" sem duplicar o texto no HTML). Um clique enquanto já fala
 * interrompe a fala em vez de empilhar.
 *
 * Qualidade e disponibilidade de vozes em pt-BR variam por navegador
 * e sistema operacional do aluno — isso é esperado e aceitável para
 * uma ferramenta de apoio gratuita; o texto escrito ao lado sempre
 * permanece a fonte principal.
 * ------------------------------------------------------------------ */
(function () {
  "use strict";

  if (!("speechSynthesis" in window) || typeof window.SpeechSynthesisUtterance !== "function") {
    // Sem suporte: os botões [data-tts] continuam no HTML (progressive
    // enhancement), simplesmente escondidos, para não prometer um
    // recurso que o navegador do aluno não pode cumprir.
    document.addEventListener("DOMContentLoaded", function () {
      document.querySelectorAll("[data-tts]").forEach(function (btn) {
        btn.hidden = true;
      });
    });
    return;
  }

  var ptVoice = null;
  var voicesReady = false;

  function pickVoice() {
    var voices = window.speechSynthesis.getVoices() || [];
    if (!voices.length) return;
    voicesReady = true;
    ptVoice =
      voices.find(function (v) { return v.lang === "pt-BR"; }) ||
      voices.find(function (v) { return /^pt-BR/i.test(v.lang); }) ||
      voices.find(function (v) { return /^pt/i.test(v.lang); }) ||
      null;
  }
  pickVoice();
  if (!voicesReady && window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = pickVoice;
  }

  var currentBtn = null;

  function setSpeaking(btn, speaking) {
    if (!btn) return;
    btn.classList.toggle("is-speaking", speaking);
    btn.setAttribute("aria-pressed", speaking ? "true" : "false");
  }

  function stop() {
    window.speechSynthesis.cancel();
    setSpeaking(currentBtn, false);
    currentBtn = null;
  }

  function speak(btn, text) {
    if (!text) return;
    var wasThisButton = currentBtn === btn;
    stop();
    if (wasThisButton) return; // clicking the same button again just stops it

    var utter = new window.SpeechSynthesisUtterance(text);
    utter.lang = "pt-BR";
    if (ptVoice) utter.voice = ptVoice;
    utter.rate = 0.95;
    utter.onend = function () { setSpeaking(btn, false); currentBtn = null; };
    utter.onerror = function () { setSpeaking(btn, false); currentBtn = null; };

    currentBtn = btn;
    setSpeaking(btn, true);
    window.speechSynthesis.speak(utter);
  }

  function textFor(btn) {
    var inline = btn.getAttribute("data-tts-text");
    if (inline) return inline;
    var targetSel = btn.getAttribute("data-tts-target");
    if (targetSel) {
      var target = document.querySelector(targetSel);
      if (target) return target.textContent;
    }
    return "";
  }

  document.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-tts]");
    if (!btn) return;
    speak(btn, textFor(btn));
  });

  // Interromper a fala ao sair da página evita uma voz "fantasma"
  // continuando a falar depois que o aluno já navegou para outro lugar.
  window.addEventListener("pagehide", function () { window.speechSynthesis.cancel(); });
})();
