#!/usr/bin/env python3
"""
Gera niveis/{nivel}/{licao}.html a partir de curriculum/{nivel}/{licao}.json,
reaproveitando o chrome compartilhado de site_chrome.py -- assim uma página
gerada fica visualmente idêntica às demais em todo o site.

Uso:
    python3 scripts/build_lesson.py                       # gera todas as lições do índice
    python3 scripts/build_lesson.py curriculum/a1/x.json   # gera só essa lição

Padrão de conteúdo (ver curriculum/SCHEMA.md):
    Objetivos -> Explicação -> Regras -> Exemplos -> Erros Comuns ->
    Exercícios Interativos -> Resumo -> Relacionado
"""
import json
import html
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
import site_chrome  # noqa: E402

CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5L20 7"/></svg>'
ARROW_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>'
BACK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5"/><path d="m11 18-6-6 6-6"/></svg>'
TTS_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/></svg>'

SKILL_LABELS = {
    "grammar": "Gramática", "vocabulary": "Vocabulário", "pronunciation": "Pronúncia",
    "reading": "Leitura", "listening": "Escuta", "speaking": "Fala",
    "writing": "Escrita", "functional": "Uso Prático",
}


def esc(s):
    return html.escape(str(s), quote=False)


def load_index():
    with open(ROOT / "curriculum" / "index.json", encoding="utf-8") as f:
        return json.load(f)


def level_lesson_list(index, level_code):
    """Returns the ordered list of lesson ids (any status) for a level."""
    lv = index["levels"].get(level_code.upper(), {})
    ids = []
    for unit in lv.get("units", []):
        for entry in unit.get("lessons", []):
            ids.append(entry["id"] if isinstance(entry, dict) else entry)
    return ids


def objectives_section(lesson):
    intro = lesson["content"].get("intro", "")
    objs = "".join(
        f'<li>{CHECK_SVG}<span>{esc(o)}</span></li>' for o in lesson["objectives"]
    )
    return f"""<section id="objetivos" class="section section--tight" aria-labelledby="obj-heading">
        <div class="section__inner split">
            <div>
                <p class="eyebrow">Introdução</p>
                <p style="font-size:var(--step-0);color:var(--color-text-muted);max-width:56ch;">{intro}</p>
            </div>
            <div class="card card--feature">
                <h2 id="obj-heading" style="font-size:var(--step-0);">Ao final desta lição você vai conseguir…</h2>
                <ul class="objectives-list">{objs}</ul>
            </div>
        </div>
    </section>"""


def explanation_section(lesson):
    explanation = lesson["content"]["explanation"]
    return f"""<section id="explicacao" class="section section--surface" aria-labelledby="exp-heading">
        <div class="section__inner section__inner--narrow">
            <p class="eyebrow">Explicação</p>
            <h2 id="exp-heading" class="visually-hidden">Explicação</h2>
            <div class="prose">{explanation}</div>
        </div>
    </section>"""


def table_html(table):
    if not table:
        return ""
    headers = "".join(f"<th>{esc(h)}</th>" for h in table["headers"])
    rows = "".join(
        "<tr>" + "".join(f"<td>{esc(c)}</td>" for c in row) + "</tr>"
        for row in table["rows"]
    )
    caption = f"<caption>{esc(table['caption'])}</caption>" if table.get("caption") else ""
    return f"""<div class="table-scroll">
        <table class="ref-table">
            {caption}
            <thead><tr>{headers}</tr></thead>
            <tbody>{rows}</tbody>
        </table>
    </div>"""


def rules_section(lesson):
    rules = lesson["content"]["rules"]
    items = "".join(f"<li>{r}</li>" for r in rules)
    table = table_html(lesson["content"].get("table"))
    layout_class = "split" if table else ""
    style = ' style="align-items:start;"' if table else ""
    return f"""<section id="regras" class="section section--tight" aria-labelledby="rules-heading">
        <div class="section__inner">
            <p class="eyebrow">Regras da Gramática</p>
            <h2 id="rules-heading">As Regras</h2>
            <div class="{layout_class}"{style}>
                <ul class="rules-list">{items}</ul>
                {table}
            </div>
        </div>
    </section>"""


def examples_section(lesson):
    examples = lesson["content"]["examples"]
    items = "".join(
        f'<li><svg class="examples-list__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5L20 7"/></svg>'
        f'<span>{ex}</span>'
        f'<button type="button" class="tts-btn" data-tts data-tts-text="{html.escape(strip_tags(ex), quote=True)}" aria-label="Ouvir esta frase">{TTS_SVG}</button></li>'
        for ex in examples
    )
    return f"""<section id="exemplos" class="section section--surface" aria-labelledby="ex-heading">
        <div class="section__inner">
            <p class="eyebrow">Exemplos</p>
            <h2 id="ex-heading">Veja na Prática</h2>
            <ul class="examples-list examples-list--tts">{items}</ul>
        </div>
    </section>"""


def strip_tags(s):
    import re
    return re.sub(r"<[^>]+>", "", s)


def mistakes_section(lesson):
    mistakes = lesson["content"]["commonMistakes"]
    cards = "".join(f"""<div class="mistake-card">
            <p class="mistake-card__wrong"><span class="badge badge--pdf" style="margin-right:.5em;">Evite</span>{esc(m['wrong'])}</p>
            <p class="mistake-card__right"><span class="badge badge--doc" style="margin-right:.5em;">Use assim</span>{esc(m['right'])}</p>
            <p class="mistake-card__why">{m['why']}</p>
        </div>""" for m in mistakes)
    tip = lesson["content"].get("tip")
    tip_html = ""
    if tip:
        tip_html = f'<div class="notice mt-lg"><svg class="" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/></svg><strong>Dica</strong><p>{tip}</p></div>'
    return f"""<section id="erros-comuns" class="section section--tight" aria-labelledby="mist-heading">
        <div class="section__inner">
            <p class="eyebrow">Erros Comuns</p>
            <h2 id="mist-heading">Fique Atento</h2>
            <div class="mistakes-grid">{cards}</div>
            {tip_html}
        </div>
    </section>"""


def exercises_section(lesson):
    blocks = ""
    for ex in lesson["exercises"]:
        data = json.dumps(ex, ensure_ascii=False).replace("</", "<\\/")
        blocks += f'<div class="exercise-block"><script type="application/json" class="exercise-data">{data}</script></div>'
    return f"""<section id="exercicios" class="section section--surface" aria-labelledby="practice-heading">
        <div class="section__inner">
            <p class="eyebrow">Exercícios Interativos</p>
            <h2 id="practice-heading">Praticar</h2>
            <p style="color:var(--color-text-muted);margin-bottom:var(--space-md);max-width:60ch;">Complete cada exercício e clique em <strong>Enviar</strong> para ver sua pontuação e uma explicação de cada resposta.</p>
            {blocks}
        </div>
    </section>"""


def summary_section(lesson):
    items = "".join(f"<li>{s}</li>" for s in lesson["summary"])
    return f"""<section id="resumo" class="section section--tight" aria-labelledby="sum-heading">
        <div class="section__inner section__inner--narrow">
            <p class="eyebrow">Resumo</p>
            <h2 id="sum-heading">Revisão</h2>
            <ul class="summary-list">{items}</ul>
        </div>
    </section>"""


def related_section(lesson, prev_lesson, next_lesson, level_slug, level_code):
    related = lesson.get("related", [])
    cards = ""
    for i, r in enumerate(related):
        letter = chr(ord("A") + i)
        rel_slug = slug_from_id(r["lessonId"], level_code)
        cards += f"""<a class="level-card" href="{rel_slug}.html">
                    <span class="level-card__code">{letter}</span>
                    <span class="level-card__name">Lição Relacionada</span>
                    <p>{esc(r['label'])}</p>
                    <span class="level-card__link">Abrir lição {ARROW_SVG}</span>
                </a>"""
    grid = f'<div class="grid">{cards}</div>' if cards else ""

    nav_parts = []
    if prev_lesson:
        nav_parts.append(f'<a class="btn btn--ghost" href="{prev_lesson["slug"]}.html">{BACK_SVG} Anterior: {esc(prev_lesson["title"])}</a>')
    nav_parts.append(f'<a class="btn btn--ghost" href="../{level_slug}.html">Voltar para {level_code}</a>')
    if next_lesson:
        nav_parts.append(f'<a class="btn btn--accent" href="{next_lesson["slug"]}.html">Próxima: {esc(next_lesson["title"])} {ARROW_SVG}</a>')
    nav = f'<div class="lesson-nav">{"".join(nav_parts)}</div>'

    return f"""<section id="relacionado" class="section section--surface" aria-labelledby="rel-heading">
        <div class="section__inner">
            <p class="eyebrow">Lições Relacionadas</p>
            <h2 id="rel-heading">Continue Aprendendo</h2>
            {grid}
            {nav}
        </div>
    </section>"""


def slug_from_id(lesson_id, level_code):
    prefix = level_code.lower() + "-"
    return lesson_id[len(prefix):] if lesson_id.startswith(prefix) else lesson_id


def build_one(json_path, index):
    with open(json_path, encoding="utf-8") as f:
        lesson = json.load(f)

    level_code = lesson["level"]
    level_slug = level_code.lower()
    level_display = next((c for c, n, s in site_chrome.LEVELS if s == level_slug), level_code)
    level_pt_name = next((n for c, n, s in site_chrome.LEVELS if s == level_slug), "")

    lesson_ids = level_lesson_list(index, level_code)
    slug = slug_from_id(lesson["id"], level_code)
    try:
        pos = lesson_ids.index(lesson["id"])
    except ValueError:
        pos = 0
    total = len(lesson_ids)

    def lesson_stub(lid):
        if not lid:
            return None
        stub_path = ROOT / "curriculum" / level_slug / f"{lid}.json"
        if not stub_path.exists():
            return None
        with open(stub_path, encoding="utf-8") as f:
            stub = json.load(f)
        return {"slug": slug_from_id(lid, level_code), "title": stub["title"]}

    prev_id = lesson_ids[pos - 1] if pos > 0 else None
    next_id = lesson_ids[pos + 1] if pos < total - 1 else None
    prev_lesson = lesson_stub(prev_id)
    next_lesson = lesson_stub(next_id)

    rel = "../../"
    title = f"{lesson['title']} — {level_display} Português Brasileiro — Renan, o Professor"
    desc_src = strip_tags(lesson["content"]["explanation"])[:150]
    description = f"{lesson['title']}: {desc_src}".replace('"', "'")

    breadcrumb = (
        f'<li><a href="{rel}index.html">Início</a></li>'
        f'<li><a href="{rel}index.html#gramatica">Níveis</a></li>'
        f'<li><a href="../{level_slug}.html">{level_display} {level_pt_name}</a></li>'
        f'<li aria-current="page">{esc(lesson["title"])}</li>'
    )

    page_header = f"""<div class="page-header">
        <div class="page-header__inner">
            <div class="page-header__text">
                <p class="eyebrow hero__eyebrow">{level_display} · Lição {pos + 1} de {total}</p>
                <h1>{esc(lesson['title'])}</h1>
                <p class="page-header__lede">{esc(lesson['subtitle'])}</p>
            </div>
        </div>
    </div>"""

    toc = ('<div class="level-toc"><div class="level-toc__inner">'
           '<a href="#objetivos">Objetivos</a><a href="#explicacao">Explicação</a>'
           '<a href="#regras">Regras</a><a href="#exemplos">Exemplos</a>'
           '<a href="#erros-comuns">Erros Comuns</a><a href="#exercicios">Exercícios</a>'
           '<a href="#resumo">Resumo</a><a href="#relacionado">Relacionado</a>'
           '</div></div>')

    body = "".join([
        page_header,
        toc,
        objectives_section(lesson),
        explanation_section(lesson),
        rules_section(lesson),
        examples_section(lesson),
        mistakes_section(lesson),
        exercises_section(lesson),
        summary_section(lesson),
        related_section(lesson, prev_lesson, next_lesson, level_slug, level_display),
    ])

    html_out = (
        site_chrome.head(rel, title, description)
        + site_chrome.header(rel, level_display, breadcrumb)
        + body
        + site_chrome.footer(rel, extra_scripts=f'<script src="{rel}assets/js/mastery.js"></script>')
    )

    out_dir = ROOT / "niveis" / level_slug
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{slug}.html"
    out_path.write_text(html_out, encoding="utf-8")
    print(f"  wrote {out_path.relative_to(ROOT)}")


def main():
    index = load_index()
    args = sys.argv[1:]
    if args:
        for p in args:
            build_one(Path(p), index)
    else:
        for json_path in sorted((ROOT / "curriculum").glob("*/*.json")):
            build_one(json_path, index)


if __name__ == "__main__":
    main()
