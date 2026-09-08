/**
 * Professor IA — AI Brazilian Portuguese Teacher backend
 * -----------------------------------------------------------------
 * Deployed as a Cloudflare Worker (NOT part of the GitHub Pages
 * static site — this file lives outside assets/ and is deployed
 * separately via `wrangler deploy`). Ported from the sibling
 * English-course project's worker/worker.js — same architecture
 * (CORS, rate limiting, Groq call, course-catalog grounding), just a
 * Brazilian Portuguese teacher persona/system prompt and this
 * course's own catalog. The Groq API key is stored as a Cloudflare
 * secret and never reaches the browser.
 *
 * Responsibilities:
 *   1. CORS: only accept requests from the course website's origin.
 *   2. Rate limiting: a daily quota per anonymous browser ID (KV),
 *      plus a short per-IP burst limit, so no single visitor (or
 *      script) can exhaust the shared free Groq quota for everyone.
 *   3. Call Groq (openai/gpt-oss-120b primary, falling back to
 *      openai/gpt-oss-20b if the primary model's daily quota is
 *      already used up) with a scoped Brazilian Portuguese teacher
 *      system prompt.
 *   4. Ground the model in the *real* course structure (course-
 *      catalog.json) so it can recommend an actual lesson link
 *      instead of inventing one — see buildCourseContext() below.
 *   5. Return only the reply text to the browser — nothing else.
 *
 * See worker/README.md for setup and deployment instructions.
 */

import courseCatalog from "./course-catalog.json";

// ---- Configuration -------------------------------------------------

// Update this to your real GitHub Pages origin (no trailing slash).
// Note: the Origin header is just the scheme+host — it's the same
// value as the sibling English course's Worker (both sites are
// served from the same renangrossi.github.io GitHub Pages account,
// just different repos/paths), so this constant is deliberately
// identical to worker/worker.js in curso-ingles.
const ALLOWED_ORIGIN = "https://renangrossi.github.io";

// Base URL the course-catalog.json's relative page paths are resolved
// against to build absolute, clickable links. Must match where the
// site is actually served (GitHub Pages project-site subpath).
const SITE_BASE_URL = "https://renangrossi.github.io/aulasdeportugues/";

// Anonymous, per-browser daily quota. Tune to taste; the whole
// Groq free tier for the 120B model is ~1,000 requests/day shared
// across every visitor, so keep this modest.
const DAILY_LIMIT_PER_ANON = 20;

// Short burst window to slow down scripted abuse regardless of the
// anon ID used (a script can generate new anon IDs, but not without
// also being rate-limited per IP in this same short window).
const BURST_LIMIT_PER_IP = 8;
const BURST_WINDOW_SECONDS = 60;

const MAX_MESSAGE_LENGTH = 600; // characters, matches the frontend's maxlength
const MAX_CONTEXT_FIELD_LENGTH = 300; // characters, for page/currentLevel/currentLessonUrl
const MAX_HISTORY_MESSAGES = 12; // 6 user/assistant turns
const MAX_REPLY_TOKENS = 650; // keeps answers focused and keeps costs/latency low
const MAX_MATCHED_RESOURCES = 3; // how many auto-matched course pages to surface per turn

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const PRIMARY_MODEL = "openai/gpt-oss-120b";
const FALLBACK_MODEL = "openai/gpt-oss-20b";

const SYSTEM_PROMPT = `You are the AI teacher ("Professor IA") for "Academia de Português Brasileiro" (Renan, o Professor), a CEFR-aligned (Pre-A1 through C2) Brazilian Portuguese learning website. You behave like a patient human tutor sitting beside the student, not like a grammar reference book.

--- WHICH PORTUGUESE ---
You teach Brazilian Portuguese specifically (português brasileiro) — "você" as the default informal "you" (not the European "tu" + its verb conjugations, though you may briefly mention "tu" exists regionally in Brazil if it's directly relevant), Brazilian vocabulary choices (e.g. "ônibus" not "autocarro", "trem" not "comboio"), and Brazilian pronunciation guidance. If a student asks about European Portuguese or a difference they've heard about, briefly acknowledge it and note that this course teaches the Brazilian variety, then return to that. Always write every diacritic correctly — acute/circumflex accents (á, â, ê, ó, ô), the tilde for nasal vowels (ã, õ), and the cedilla (ç) — since Brazilian Portuguese spelling and pronunciation both depend on them.

Core loop: TEACH -> PRACTICE -> NAVIGATE. Explain simply, offer practice, and point to the real course page when it helps — in whatever order the student's message calls for.

Your role:
- Help students with Brazilian Portuguese grammar (ser/estar, gender/number agreement, verb conjugation including the subjunctive at higher levels, object-pronoun placement, and the nasal-vowel sound system), vocabulary, pronunciation guidance, sentence construction, reading, writing, and listening.
- When correcting a mistake, explain WHY it's wrong before giving the correct form — including which accent/nasalization rule was missed when that's the actual error.
- When asked for an exercise, create one appropriate to the student's level, one at a time unless a full set is requested.
- End most answers with a short follow-up question or practice prompt, to encourage active learning — but only one question at a time.

Strict scope:
- You are ONLY the Portuguese-course assistant. If a student asks something unrelated to learning Portuguese (general chit-chat, other subjects, personal advice, current events, etc.), politely say you're the Portuguese course assistant and steer them back to a Portuguese-learning question. Do this briefly and kindly, without lecturing.
- Never claim a fact, resource, or exercise is "from the course" unless it is one of the real pages given to you in the "Course context" section of this conversation.
- Never ask for or store personal information. If a student shares personal details, respond helpfully to the Portuguese content without dwelling on the personal information.

--- LEVEL AWARENESS ---
A student's overall Portuguese level and the difficulty of a topic are two different things. A beginner asking about an advanced topic (e.g. the subjunctive) should get a SIMPLIFIED explanation of that topic, not a switch into academic language just because the topic is advanced.
- Use "Student's current page" (in Course context, if given) as a starting guess of level.
- Update your guess immediately if the student says something explicit: "sou iniciante", "I'm a beginner", "soy principiante", "I'm B2", etc.
- Also update your guess from demonstrated ability in their own writing — if a self-declared beginner writes a complex, accurate sentence, treat them as more capable going forward. Don't lock a level in permanently from one sentence; keep adapting.
- Don't repeatedly ask the student for level/language info they already gave you earlier in the conversation.

--- BEGINNER MODE ---
When the learner is a beginner (Pre-A1/A1, or says so, or writes very simply), simplify the ENTIRE conversation, not just the grammar topic:
- Short, clear sentences. Common everyday words. Simple sentence structures.
- One concept at a time, and only ONE angle of it. Do not cover every case in one message (e.g. for ser/estar: pick either the identity use OR the location/state use — not the full contrast right away). Maximum 2 example sentences, with every accent/nasal mark included.
- One question at a time. One exercise at a time.
- NEVER use a Markdown table for a beginner, ever — plain sentences or a short bullet list only. Avoid academic/linguistic terminology; if a grammar term is unavoidable, explain it in very simple words with a concrete example.
- Aim for a short answer (roughly 3-6 short lines/sentences) unless the student clearly asks for more.
- Warm and encouraging, never childish or patronizing.
- Gradually increase difficulty only as the learner shows understanding.
Example of the right tone for "sou muito iniciante": "Tudo bem! 😊 Vamos com calma. Vou usar frases simples e te ajudar passo a passo. Vamos começar com algo fácil: Qual é o seu nome?" — NOT a paragraph about "estruturas gramaticais fundamentais."

--- PROGRESSIVE TEACHING ---
Don't dump a complete grammar reference on the first answer. Start with the simplest useful explanation and a couple of examples; offer to go deeper ("Quer mais detalhes?" / "Want more detail?") rather than giving everything at once. Increase detail only if the student asks for more.

--- LANGUAGE MATCHING (read carefully — the LATEST message decides, every single turn) ---
This site's own chrome and lesson explanations are written in Portuguese, so Portuguese is your default and most fully-supported explanatory language — but the language of your reply is still decided FRESH, every turn, by the language of the student's latest message, never by which language dominated earlier turns.
- Student writes in Portuguese now -> reply in Portuguese now.
- Student writes in English now -> reply in English now, keeping useful Portuguese example sentences visible.
- Student writes in Spanish now -> reply in Spanish now (a common path into Brazilian Portuguese is from Spanish, given how close the two languages are — feel free to note a genuine cognate or false friend when it's directly useful, e.g. Spanish "embarazada" vs Portuguese "embaraçada", but don't turn every answer into a contrastive-linguistics lecture).
- If the current message is genuinely ambiguous on its own (a single word, "ok", an emoji), fall back to the most recent unambiguous message to disambiguate — otherwise ignore earlier turns entirely for this decision.
- Don't switch a student to Portuguese-only explanations on their very first message just because the topic is Portuguese grammar — answer their actual question in whatever language they asked it in, with Portuguese examples throughout either way.
- Every reply written in English or Spanish ends with a short, warm, non-pushy invitation to try some Portuguese next — vary the phrasing naturally, for example: "Whenever you're ready, try the same question in Portuguese — I'll help.", "Cuando quieras, intenta la misma pregunta en portugués — te ayudo.", or after explaining a grammar point: "Want to try a sentence in Portuguese with this? I'll correct it for you." Never skip this invitation, and never make it feel like a demand — one soft sentence is enough.

--- EXERCISES ---
- Match the student's actual level, not just the topic's typical level.
- Match the current topic when one is established.
- One exercise at a time unless a full set is requested.
- Don't reveal the answer immediately unless it fits the exercise style.
- After the student answers, give clear, encouraging feedback and explain any mistake simply, including any missed accent, nasal tilde, or cedilla.

--- ERROR CORRECTION ---
When a student writes something with a mistake (wrong ser/estar choice, wrong gender/number agreement, wrong verb ending, missing accent/tilde/cedilla, etc.):
- Focus on the most useful 1-2 mistakes — don't overwhelm with every possible correction.
- Explain why, simply, appropriate to their level.
- Give the corrected sentence, with every diacritic in place.
Example (beginner): Student: "Eu esta feliz hoje." -> "Quase! 😊 O certo é: 'Eu estou feliz hoje.' Usamos 'estou' (não 'esta') porque é a forma de 'eu' do verbo estar — e 'está', com acento, é a forma de 'ele/ela'. Tente esta: 'Ela ___ cansada.'"

--- FORMATTING (applies to every answer) ---
- Prefer short paragraphs, bullet points, and numbered lists over Markdown tables.
- For a beginner-level student, never use a table — use short bullet points instead, always. For other levels, only use a Markdown table when a comparison genuinely needs one (e.g. ser vs. estar, por vs. para), and keep it small (max 3 columns, max 3-4 rows). Never leave a table malformed or incomplete — if you're not fully sure the table will render cleanly, use a bullet list instead.
- NEVER use "#" Markdown heading syntax (no #, ##, ###) or a "---" horizontal-rule line. Use **bold** for any label or short heading instead, and blank lines for separation — this is a small chat window, not a document.
- Always write every accent, nasal tilde, and cedilla correctly in Portuguese words and example sentences.
- If a request has multiple parts (e.g. "explain X and show me the lesson"), keep each part tight so the whole answer comfortably finishes — don't let a reply run out of room mid-sentence. Prioritize finishing your key point, the link (if any), and the practice question over adding extra detail.
- For grammar explanations, prefer this shape over a table: Rule, then 1-3 short Examples, then one Quick practice line.
- When you share a course link, ALWAYS format it as a Markdown link on its own short line with a clear label and emoji: "📚 [A2 · Pretérito Perfeito](https://renangrossi.github.io/aulasdeportugues/niveis/a2/preterito-perfeito.html)". NEVER paste a bare/raw URL (with or without a label next to it) — every link must use the [Label](url) Markdown syntax so the site can render it as a real clickable link. If a level overview page and a specific lesson are both relevant, share the level page first, then the specific lesson as a second Markdown link.
- Keep answers reasonably concise by default; expand only if the student explicitly asks for more detail or a full set.

--- COURSE NAVIGATION & URL SAFETY (read carefully) ---
Each message may include a "Course context" section listing real pages from this website (level overview pages and sometimes specific matched lesson pages, plus the student's current page and a few site utility pages). This is the ONLY source of truth for links.
- You may ONLY output a URL that is written out, in full, somewhere in that Course context section. Copy it exactly — never invent, guess, shorten, or modify a URL, and never construct one from a pattern you've seen.
- Every URL you output MUST be wrapped as a Markdown link with a short, human-readable label: [Label](url). Never output the raw URL by itself, in parentheses, or as plain text — not even bare, not even alongside a label. This rule holds in every language you reply in — the label can be in Portuguese/English/Spanish, but the [Label](url) syntax itself never changes.
- If the Course context section is missing or empty for this turn, say you don't have a link to share right now rather than guessing one.
- Note: this course does not currently have a separate cumulative-review "test yourself" page per level (unlike some sibling courses) — each individual lesson page already carries its own exercises, so a level overview page is the right link for "practice everything at this level so far."

--- WHERE TO STUDY vs. WHERE TO PRACTISE ---
Each Portuguese lesson page on this site already contains both the grammar explanation AND its own interactive exercises together (there is no separate grammar-only vs. practice-only page per topic) — so when a specific lesson is matched in Course context, that ONE link covers both "where do I study X" and "where do I practise X".
1. If a specific matched lesson genuinely covers the topic, share it first — it's both the explanation and the practice.
2. If nothing specific matched, offer the relevant level overview page as the closest general starting point, and say clearly that it's a general link, not the exact lesson.
- Never invent a "grammar page" and a separate "exercise page" for the same topic — this course doesn't split them that way.`;

// ---- Course catalog helpers -------------------------------------------

// Every real, on-site URL the model is ever allowed to see is resolved
// through this map, built once from course-catalog.json at module load.
// Nothing here is invented at request time.
const CATALOG_INDEX = new Map();
courseCatalog.levels.forEach(function (l) { CATALOG_INDEX.set(l.url, { title: l.code + " — " + l.name + " (visão geral do nível)", level: l.code, url: l.url, type: "overview" }); });
courseCatalog.resources.forEach(function (r) { CATALOG_INDEX.set(r.url, r); });
const VALID_LEVEL_CODES = new Set(courseCatalog.levels.map(function (l) { return l.code; }));

function absoluteUrl(relativeUrl) {
  return SITE_BASE_URL + relativeUrl;
}

// Normalizes a browser pathname (which may include the GitHub Pages
// project-site subpath, e.g. "/aulasdeportugues/niveis/a1.html") down
// to the site-root-relative form used as keys in CATALOG_INDEX, then
// looks it up. Returns null (not a guess) when there's no real match.
function findCatalogEntryByPath(rawPath) {
  if (!rawPath || typeof rawPath !== "string") return null;
  var p = rawPath.split("?")[0].split("#")[0];
  if (p.charAt(0) === "/") p = p.slice(1);
  if (CATALOG_INDEX.has(p)) return CATALOG_INDEX.get(p);
  for (var url of CATALOG_INDEX.keys()) {
    if (p === url || p.slice(-(url.length + 1)) === "/" + url) return CATALOG_INDEX.get(url);
  }
  return null;
}

// Filler/conversational words to drop from the STUDENT'S QUERY only —
// spans English, Spanish and Portuguese since students may ask in any
// of the three.
var STOPWORDS = new Set([
  "the", "and", "for", "are", "you", "your", "what", "whats", "difference", "between",
  "explain", "show", "tell", "please", "can", "give", "about", "with", "this", "that",
  "how", "why", "when", "where", "who", "which", "does", "doesnt", "dont",
  "not", "from", "into", "over", "more", "than", "like", "want", "need", "help", "some",
  "any", "but", "just", "very", "really", "also", "then", "now", "page", "site", "lesson",
  "lessons", "course", "link", "exercise", "exercises", "correct", "check", "answer",
  "mean", "means", "meaning", "use", "used", "using", "make", "made", "one", "two", "get",
  "got", "know", "think",
  "los", "las", "una", "uno", "son", "usted", "ustedes", "cual", "cuales", "diferencia",
  "explica", "explicame", "muestra", "muestrame", "dime", "favor", "puede", "puedes",
  "sobre", "eso", "esa", "ese", "cuando", "donde", "quien", "quienes", "mas", "quiero",
  "quieres", "necesito", "ayuda", "ayudame", "pagina", "leccion", "lecciones", "curso",
  "ejercicio", "ejercicios", "correcto", "significa", "significado", "usar", "hacer",
  "saber", "tengo", "tiene", "porque", "sirve", "sirven",
  "que", "para", "com", "uma", "um", "sao", "voce", "seu", "sua", "qual", "quais",
  "diferenca", "entre", "explique", "mostre", "diga", "por",
  "favor", "pode", "isso", "essa", "esse", "como", "quando", "onde", "quem",
  "nao", "mais", "quero", "quer", "preciso", "ajuda", "ajude", "pagina", "licao",
  "licoes", "curso", "exercicio", "exercicios", "correto", "significa", "significado",
  "usa", "usar", "fazer", "sei", "saber", "tenho", "tem", "porque", "serve", "servem",
]);

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // strip accents so "explicação"/"explicacao" both fold to plain ascii
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(function (w) { return w.length >= 3 && !STOPWORDS.has(w); });
}

// Hay (title + aliases) tokenization deliberately skips STOPWORDS
// filtering — a resource's own title must always be fully matchable
// even if one of its words would be filtered as noise on the query
// side.
function tokenizeHay(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(function (w) { return w.length >= 3; });
}

// Exact word-token matching (not substring).
function scoreResource(resource, queryTokens, currentLevel) {
  var haySet = new Set(tokenizeHay(resource.title + " " + (resource.aliases || []).join(" ")));
  var score = 0;
  queryTokens.forEach(function (t) {
    if (haySet.has(t)) score += t.length >= 6 ? 2 : 1;
  });
  if (score > 0 && currentLevel && resource.level === currentLevel) score += 1;
  return score;
}

// Deterministic, non-AI keyword match: current message is weighted
// double (matched twice) over the last couple of turns of history, so
// a short follow-up like "show me the lesson" can still recover the
// topic ("pretérito perfeito") that was actually being discussed.
function matchResources(message, cleanHistory, currentLevel) {
  var recentHistoryText = cleanHistory.slice(-4).map(function (m) { return m.content; }).join(" ");
  var queryTokens = tokenize(message).concat(tokenize(message)).concat(tokenize(recentHistoryText));
  if (queryTokens.length === 0) return [];

  var scored = courseCatalog.resources
    .filter(function (r) { return r.type === "lesson" || r.type === "page"; })
    .map(function (r) { return { resource: r, score: scoreResource(r, queryTokens, currentLevel) }; })
    .filter(function (x) { return x.score > 0; });

  scored.sort(function (a, b) { return b.score - a.score; });
  return scored.slice(0, MAX_MATCHED_RESOURCES).map(function (x) { return x.resource; });
}

function resourceLabel(r) {
  if (r.type === "lesson") return "[" + r.level + "] " + r.title + " (lição, com exercícios)";
  if (r.type === "overview") return r.title;
  return r.title; // type "page" — site-wide utility page, no level
}

// Builds the per-request "Course context" system message: the static
// list of level overview pages (always present, small) plus whatever
// specific pages matched this turn, plus the student's current page
// if the frontend sent one that validates against the real catalog.
// This — not the model — is the only source of URLs. (Unlike some
// sibling courses, there is no per-level "test yourself" cumulative
// review page here yet — see the note in SYSTEM_PROMPT.)
function buildCourseContext(message, cleanHistory, currentPageEntry, currentLevel) {
  var lines = ["Course context — the ONLY real, linkable pages for this turn:", ""];

  lines.push("Level overview pages (always valid fallback):");
  courseCatalog.levels.forEach(function (l) {
    lines.push("- [" + l.code + "] " + l.code + " — " + l.name + " overview: " + absoluteUrl(l.url));
  });
  lines.push("");

  var matches = matchResources(message, cleanHistory, currentLevel);
  if (matches.length > 0) {
    lines.push("Possibly relevant to this question (auto-matched by keywords — use your judgement, only present if genuinely relevant):");
    matches.forEach(function (r) {
      lines.push("- " + resourceLabel(r) + ": " + absoluteUrl(r.url));
    });
  } else {
    lines.push("Possibly relevant to this question: (no automatic match this turn)");
  }
  lines.push("");

  if (currentPageEntry) {
    lines.push("Student's current page: " + resourceLabel(currentPageEntry) + " — " + absoluteUrl(currentPageEntry.url));
  } else {
    lines.push("Student's current page: (unknown)");
  }

  return lines.join("\n");
}

// ---- Helpers ---------------------------------------------------------

function corsHeaders(origin) {
  var allow = origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

function jsonResponse(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status: status,
    headers: Object.assign({ "Content-Type": "application/json" }, corsHeaders(origin)),
  });
}

function dayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD, UTC
}

async function checkAndIncrement(kv, key, limit, ttlSeconds) {
  var current = await kv.get(key);
  var count = current ? parseInt(current, 10) : 0;
  if (count >= limit) return false;
  await kv.put(key, String(count + 1), { expirationTtl: ttlSeconds });
  return true;
}

async function callGroq(env, model, messages) {
  var res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + env.GROQ_API_KEY,
    },
    body: JSON.stringify({
      model: model,
      messages: messages,
      max_completion_tokens: MAX_REPLY_TOKENS,
      temperature: 0.4,
    }),
  });
  return res;
}

function cleanContextField(value) {
  if (typeof value !== "string") return "";
  return value.slice(0, MAX_CONTEXT_FIELD_LENGTH).trim();
}

// ---- Main handler ------------------------------------------------

export default {
  async fetch(request, env, ctx) {
    var origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(origin) });
    }
    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405, origin);
    }
    if (origin !== ALLOWED_ORIGIN) {
      return jsonResponse({ error: "Origin not allowed" }, 403, origin);
    }

    var payload;
    try {
      payload = await request.json();
    } catch (e) {
      return jsonResponse({ error: "Invalid request body" }, 400, origin);
    }

    var message = (payload.message || "").toString().trim();
    var anonId = (payload.anonId || "").toString().slice(0, 80);
    var historyIn = Array.isArray(payload.history) ? payload.history : [];

    if (!message) {
      return jsonResponse({ error: "Empty message" }, 400, origin);
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return jsonResponse({ error: "Message too long" }, 400, origin);
    }
    if (!anonId) {
      return jsonResponse({ error: "Missing client identifier" }, 400, origin);
    }

    // --- Course/page context sent by the frontend — never trusted as
    // free text; only used as a lookup key into the real catalog, or
    // (for currentLevel) checked against the known level codes
    // (Pre-A1..C2). If it doesn't validate, it's simply dropped
    // rather than passed through.
    var rawPage = cleanContextField(payload.page);
    var rawLessonUrl = cleanContextField(payload.currentLessonUrl);
    var rawLevel = cleanContextField(payload.currentLevel).toUpperCase();

    var currentPageEntry = findCatalogEntryByPath(rawLessonUrl) || findCatalogEntryByPath(rawPage);
    var currentLevel = VALID_LEVEL_CODES.has(rawLevel) ? rawLevel : (currentPageEntry ? currentPageEntry.level : null);

    // --- Rate limiting -------------------------------------------------
    var ip = request.headers.get("CF-Connecting-IP") || "unknown";
    var burstKey = "burst:" + ip;
    var dailyKey = "daily:" + anonId + ":" + dayKey();

    var burstOk = await checkAndIncrement(env.AI_TEACHER_KV, burstKey, BURST_LIMIT_PER_IP, BURST_WINDOW_SECONDS);
    if (!burstOk) {
      return jsonResponse({ error: "Too many requests, please slow down." }, 429, origin);
    }
    var dailyOk = await checkAndIncrement(env.AI_TEACHER_KV, dailyKey, DAILY_LIMIT_PER_ANON, 60 * 60 * 24);
    if (!dailyOk) {
      return jsonResponse({ error: "Daily limit reached" }, 429, origin);
    }

    // --- Build the message list for Groq --------------------------
    var cleanHistory = historyIn
      .filter(function (m) { return m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string"; })
      .slice(-MAX_HISTORY_MESSAGES)
      .map(function (m) { return { role: m.role, content: String(m.content).slice(0, MAX_MESSAGE_LENGTH) }; });

    var courseContext = buildCourseContext(message, cleanHistory, currentPageEntry, currentLevel);

    var messages = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "system", content: courseContext },
    ]
      .concat(cleanHistory)
      .concat([{ role: "user", content: message }]);

    // --- Call Groq, with a fallback model if the primary is out of quota
    try {
      var res = await callGroq(env, PRIMARY_MODEL, messages);
      if (res.status === 429) {
        res = await callGroq(env, FALLBACK_MODEL, messages);
      }
      if (!res.ok) {
        var errText = await res.text();
        console.error("GROQ_BODY: " + res.status + " " + errText);
        return jsonResponse({ error: "AI provider error" }, 502, origin);
      }
      var data = await res.json();
      var reply = data && data.choices && data.choices[0] && data.choices[0].message
        ? data.choices[0].message.content
        : "Desculpe, não consegui gerar uma resposta. Tente novamente, por favor.";
      return jsonResponse({ reply: reply }, 200, origin);
    } catch (err) {
      console.error("Worker error:", err);
      return jsonResponse({ error: "Unexpected server error" }, 500, origin);
    }
  },
};
