#!/usr/bin/env python3
"""
Gera niveis/{nivel}.html (a página-hub de um nível) a partir de
curriculum/index.json -- lista todas as lições de um nível, com link
para as já publicadas e um cartão "Em breve" para as planejadas.

Uso: python3 scripts/build_level_page.py   (gera as 7 páginas de nível)
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
import site_chrome  # noqa: E402

ARROW_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>'
BACK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5"/><path d="m11 18-6-6 6-6"/></svg>'
CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5L20 7"/></svg>'

LEVEL_INTROS = {
    "PRE-A1": {
        "lede": "O primeiro contato com o português: sons, saudações, números e as primeiras frases completas.",
        "about": "Pre-A1 é para quem está começando do absoluto zero. Ao final deste nível, você reconhece o alfabeto e os principais sons do português, sabe se apresentar, contar, dizer as horas, pedir ajuda em sala de aula e ler um texto muito simples sobre o dia a dia.",
        "goals": ["Reconhecer os sons e letras do português brasileiro", "Cumprimentar, se apresentar e trocar informações básicas", "Ler e entender frases curtas do cotidiano"],
    },
    "A1": {
        "lede": "A gramática essencial do presente: ser e estar, verbos regulares e irregulares, artigos, pronomes e perguntas.",
        "about": "A1 constrói a base gramatical completa do tempo presente. É o nível mais denso do curso — vinte lições que, juntas, permitem descrever pessoas, lugares e rotinas, fazer perguntas e dar instruções simples com confiança.",
        "goals": ["Dominar ser e estar, os dois verbos mais importantes do português", "Conjugar verbos regulares e os irregulares mais comuns no presente", "Formar frases completas com concordância correta de gênero e número"],
    },
    "A2": {
        "lede": "O passado entra em cena: pretérito perfeito e imperfeito, comparações e os primeiros condicionais.",
        "about": "A2 expande o A1 para o passado e para descrições mais ricas — comparar pessoas e coisas, falar de hábitos antigos versus eventos pontuais, e começar a usar por/para e pronomes relativos.",
        "goals": ["Contar o que aconteceu (pretérito perfeito) e como as coisas costumavam ser (imperfeito)", "Comparar pessoas, lugares e coisas", "Combinar frases mais longas com pronomes relativos e conectores"],
    },
    "B1": {
        "lede": "O grande desafio do português: o subjuntivo, a voz passiva e a colocação dos pronomes.",
        "about": "B1 introduz estruturas que não têm equivalente direto em muitos outros idiomas — especialmente o futuro do subjuntivo e a colocação pronominal (próclise, mesóclise, ênclise). É o nível onde o português começa a se revelar como uma língua com uma lógica muito própria.",
        "goals": ["Usar o presente e o futuro do subjuntivo em contextos reais", "Posicionar corretamente os pronomes oblíquos em qualquer frase", "Relatar o que outra pessoa disse (discurso indireto) e usar a voz passiva"],
    },
    "B2": {
        "lede": "Domínio do subjuntivo, regência, crase e os recursos do português mais formal.",
        "about": "B2 aprofunda tudo o que começou no B1 e adiciona as ferramentas do português escrito e formal: regência verbal e nominal, crase, conectores argumentativos e a diferença clara entre registro formal e informal.",
        "goals": ["Dominar o sistema completo do subjuntivo (presente, imperfeito, futuro)", "Usar crase e regência corretamente na escrita formal", "Adaptar o registro da fala conforme o contexto social"],
    },
    "C1": {
        "lede": "Leitura de textos autênticos, nuances do subjuntivo e a riqueza da variação regional do Brasil.",
        "about": "C1 é o nível da fluência real: ler jornais e textos literários sem simplificação, perceber nuances de significado no subjuntivo e reconhecer diferenças regionais de vocabulário e pronúncia dentro do próprio Brasil.",
        "goals": ["Ler textos jornalísticos e literários autênticos", "Perceber nuances de significado em estruturas complexas", "Reconhecer a variação linguística entre regiões do Brasil"],
    },
    "C2": {
        "lede": "Proficiência quase nativa: registro literário, ironia, humor e domínio total dos tempos verbais.",
        "about": "C2 é o topo do curso — domínio total do sistema verbal, capacidade de perceber ironia e humor, transitar entre registros coloquiais e literários, e produzir textos com precisão de um falante nativo culto.",
        "goals": ["Dominar todos os tempos e modos verbais com precisão nativa", "Reconhecer ironia, humor e ambiguidade em textos e conversas", "Transformar o registro de um texto conforme o público-alvo"],
    },
}


def load_index():
    with open(ROOT / "curriculum" / "index.json", encoding="utf-8") as f:
        return json.load(f)


def load_lesson(level_slug, lesson_id):
    p = ROOT / "curriculum" / level_slug / f"{lesson_id}.json"
    if not p.exists():
        return None
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def slug_from_id(lesson_id, level_code):
    prefix = level_code.lower() + "-"
    return lesson_id[len(prefix):] if lesson_id.startswith(prefix) else lesson_id


def lesson_card_html(level_code, level_slug, entry, index_in_level):
    lesson_id = entry["id"]
    status = entry["status"]
    if status == "published":
        lesson = load_lesson(level_slug, lesson_id)
        title = lesson["title"]
        subtitle = lesson["subtitle"]
        slug = slug_from_id(lesson_id, level_code)
        return f"""<article class="lesson-card">
            <span class="lesson-card__index">{index_in_level:02d}</span>
            <h3><a class="lesson-card__title-link" href="{level_slug}/{slug}.html">{title}</a></h3>
            <p>{subtitle}</p>
            <div class="lesson-card__actions"><span class="badge badge--doc">Interativa</span></div>
        </article>"""
    title = entry.get("title", lesson_id)
    return f"""<article class="lesson-card is-unavailable">
            <span class="lesson-card__index">{index_in_level:02d}</span>
            <h3>{title}</h3>
            <p>Esta lição ainda está no roteiro pedagógico do curso.</p>
            <div class="lesson-card__actions"><span class="badge badge--soon">Em breve</span></div>
        </article>"""


def build_level(level_code, index):
    level_slug = level_code.lower()
    level_pt_name = next((n for c, n, s in site_chrome.LEVELS if s == level_slug), "")
    intro = LEVEL_INTROS[level_code]

    lv = index["levels"][level_code]
    units = lv["units"]
    total_lessons = sum(len(u["lessons"]) for u in units)
    published = sum(1 for u in units for l in u["lessons"] if l["status"] == "published")

    rel = "../"
    title = f"{level_code} — {level_pt_name} — Português Brasileiro — Renan, o Professor"
    description = intro["lede"]

    breadcrumb = (
        f'<li><a href="{rel}index.html">Início</a></li>'
        f'<li><a href="{rel}index.html#gramatica">Níveis</a></li>'
        f'<li aria-current="page">{level_code} {level_pt_name}</li>'
    )

    page_header = f"""<div class="page-header">
        <div class="page-header__inner">
            <div class="page-header__text">
                <p class="eyebrow hero__eyebrow">Nível {level_code} &middot; {published} de {total_lessons} lições publicadas</p>
                <h1>{level_code} — {level_pt_name}</h1>
                <p class="page-header__lede">{intro['lede']}</p>
            </div>
        </div>
    </div>"""

    goals = "".join(f'<li>{CHECK_SVG}<span>{g}</span></li>' for g in intro["goals"])
    about_section = f"""<section id="sobre" class="section section--tight" aria-labelledby="about-heading">
        <div class="section__inner split">
            <div>
                <p class="eyebrow">Sobre este nível</p>
                <h2 id="about-heading">O que esperar</h2>
                <p style="color:var(--color-text-muted);max-width:56ch;">{intro['about']}</p>
            </div>
            <div class="card card--feature">
                <h2 style="font-size:var(--step-0);">Ao final deste nível você vai conseguir…</h2>
                <ul class="objectives-list">{goals}</ul>
            </div>
        </div>
    </section>"""

    cards = []
    counter = 1
    for unit in units:
        for entry in unit["lessons"]:
            cards.append(lesson_card_html(level_code, level_slug, entry, counter))
            counter += 1
    cards_html = "".join(cards)

    lessons_section = f"""<section id="licoes" class="section section--surface" aria-labelledby="lic-heading">
        <div class="section__inner">
            <p class="eyebrow">Lições</p>
            <h2 id="lic-heading">Todas as Lições do {level_code}</h2>
            <div class="grid">{cards_html}</div>
        </div>
    </section>"""

    idx_all = list(site_chrome.LEVELS)
    pos = next(i for i, (c, n, s) in enumerate(idx_all) if s == level_slug)
    next_level = idx_all[pos + 1] if pos + 1 < len(idx_all) else None
    prev_level = idx_all[pos - 1] if pos > 0 else None
    nav_parts = []
    if prev_level:
        nav_parts.append(f'<a class="btn btn--ghost" href="{prev_level[2]}.html">{BACK_SVG} Nível anterior: {prev_level[0]}</a>')
    nav_parts.append('<a class="btn btn--ghost" href="../index.html#gramatica">Ver todos os níveis</a>')
    if next_level:
        nav_parts.append(f'<a class="btn btn--accent" href="{next_level[2]}.html">Próximo nível: {next_level[0]} {ARROW_SVG}</a>')
    nav_section = f"""<section id="proximo" class="section section--tight">
        <div class="section__inner section__inner--narrow">
            <div class="lesson-nav" style="justify-content:center;">{''.join(nav_parts)}</div>
        </div>
    </section>"""

    body = page_header + about_section + lessons_section + nav_section

    html_out = (
        site_chrome.head(rel, title, description)
        + site_chrome.header(rel, level_code, breadcrumb)
        + body
        + site_chrome.footer(rel)
    )

    out_path = ROOT / "niveis" / f"{level_slug}.html"
    out_path.write_text(html_out, encoding="utf-8")
    print(f"  wrote {out_path.relative_to(ROOT)}")


def main():
    index = load_index()
    for level_code, _, _ in site_chrome.LEVELS:
        build_level(level_code.upper(), index)


if __name__ == "__main__":
    main()
