#!/usr/bin/env python3
"""Gera index.html (a home page) a partir de conteúdo fixo + curriculum/index.json."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
import site_chrome  # noqa: E402

ARROW_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>'
CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5L20 7"/></svg>'

LEVEL_SHORT = {
    "PRE-A1": "Alfabeto, saudações, números e as primeiras frases.",
    "A1": "Ser/estar, verbos no presente, artigos e pronomes.",
    "A2": "Passado, comparações e os primeiros condicionais.",
    "B1": "Subjuntivo, voz passiva e colocação pronominal.",
    "B2": "Subjuntivo completo, crase e registro formal.",
    "C1": "Leitura autêntica e nuances da língua.",
    "C2": "Proficiência quase nativa e registro literário.",
}

SKILLS = [
    ("Gramática", "As estruturas que sustentam cada frase, do presente ao subjuntivo.", '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>'),
    ("Vocabulário", "Palavras e expressões do português do Brasil, em contexto real.", '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
    ("Leitura", "Textos curtos que crescem em complexidade a cada nível.", '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>'),
    ("Escuta", "Pratique o ouvido com a leitura em voz alta do navegador.", '<path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/>'),
    ("Escrita", "Prompts guiados para praticar frases e parágrafos próprios.", '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
    ("Fala e Pronúncia", "Dígrafos, nasalização e o ritmo do português falado no Brasil.", '<path d="m22 10-10-5L2 10l10 5 10-5Z"/><path d="M6 12v5c0 1.5 2.5 3 6 3s6-1.5 6-3v-5"/><path d="M22 10v6"/>'),
]

WHY_US = [
    "100% gratuito, sem anúncios e sem cadastro obrigatório.",
    "Motor de exercícios interativos com correção instantânea e explicação de cada resposta.",
    "Currículo pensado especificamente para os desafios do português — subjuntivo, colocação pronominal, ser/estar — não uma tradução de outro idioma.",
    "Progresso salvo no seu próprio navegador, com sequência de estudo e conquistas.",
    "Foco no português do Brasil: vocabulário, gramática e cultura brasileiros.",
]


def load_index():
    with open(ROOT / "curriculum" / "index.json", encoding="utf-8") as f:
        return json.load(f)


def level_cards_html(index):
    cards = []
    for code, letter in zip([c for c, n, s in site_chrome.LEVELS], "ABCDEFG"):
        name = next(n for c, n, s in site_chrome.LEVELS if c == code)
        slug = next(s for c, n, s in site_chrome.LEVELS if c == code)
        lv = index["levels"][code.upper()]
        total = sum(len(u["lessons"]) for u in lv["units"])
        published = sum(1 for u in lv["units"] for l in u["lessons"] if l["status"] == "published")
        status_label = f"{published} lições disponíveis" if published else f"{total} lições no roteiro"
        cards.append(f"""<a class="level-card" href="niveis/{slug}.html">
                    <span class="level-card__code">{code}</span>
                    <span class="level-card__name">{name}</span>
                    <p>{LEVEL_SHORT[code.upper()]}</p>
                    <p style="font-size:var(--step--1);color:var(--color-accent);font-weight:600;">{status_label}</p>
                    <span class="level-card__link">Ver lições {ARROW_SVG}</span>
                </a>""")
    return "".join(cards)


def skill_cards_html():
    return "".join(f"""<div class="skill-card">
                <svg class="skill-card__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{icon}</svg>
                <h3>{name}</h3>
                <p>{desc}</p>
            </div>""" for name, desc, icon in SKILLS)


def count_stats(index):
    total_lessons = 0
    total_items = 0
    for level_code, _, level_slug in site_chrome.LEVELS:
        lv = index["levels"].get(level_code.upper(), {})
        for unit in lv.get("units", []):
            for entry in unit["lessons"]:
                if entry["status"] != "published":
                    continue
                total_lessons += 1
                path = ROOT / "curriculum" / level_slug / f"{entry['id']}.json"
                lesson = json.load(open(path, encoding="utf-8"))
                for ex in lesson["exercises"]:
                    total_items += len(ex.get("items", []))
    return total_lessons, total_items


def main():
    index = load_index()
    rel = ""
    title = "Renan, o Professor — Academia de Português Brasileiro"
    description = "Aprenda português brasileiro do zero à fluência: gramática, vocabulário, leitura e exercícios interativos gratuitos, alinhados ao QECR."

    breadcrumb = '<li aria-current="page">Início</li>'

    total_lessons, total_items = count_stats(index)
    items_round = (total_items // 10) * 10  # arredonda pra baixo, "200+" em vez de "204"

    hero = f"""<section class="hero" id="missao">
        <div class="hero__inner">
            <div>
                <p class="eyebrow hero__eyebrow">Português brasileiro, do zero à fluência</p>
                <h1>Aprenda português brasileiro de verdade, um passo de cada vez.</h1>
                <p class="hero__lede">Uma academia de português alinhada ao QECR, com gramática, vocabulário e centenas de exercícios interativos — gratuita, sem anúncios, sem complicação.</p>
                <div class="hero__actions">
                    <a class="btn btn--accent" href="niveis/pre-a1.html">Começar agora {ARROW_SVG}</a>
                    <a class="btn btn--ghost" href="#gramatica">Ver o currículo completo</a>
                </div>
                <dl class="hero__stats">
                    <div class="hero__stat"><dt>{total_lessons}</dt><dd>lições interativas prontas</dd></div>
                    <div class="hero__stat"><dt>7</dt><dd>níveis do QECR, Pre-A1 a C2</dd></div>
                    <div class="hero__stat"><dt>{items_round}+</dt><dd>exercícios com correção automática</dd></div>
                </dl>
            </div>
        </div>
    </section>"""

    grammar_section = f"""<section id="gramatica" class="section section--surface" aria-labelledby="gram-heading">
        <div class="section__inner">
            <p class="eyebrow">Currículo</p>
            <h2 id="gram-heading">Trilhas de Gramática por Nível</h2>
            <p style="color:var(--color-text-muted);max-width:60ch;margin-bottom:var(--space-lg);">Sete níveis, do primeiro contato com o idioma até a proficiência quase nativa. Pre-A1 e A1 já estão completos; os demais níveis têm o roteiro pedagógico definido e crescem a cada atualização.</p>
            <div class="grid">{level_cards_html(index)}</div>
        </div>
    </section>"""

    about_cefr = """<section id="sobre-qecr" class="section section--tight" aria-labelledby="cefr-heading">
        <div class="section__inner split">
            <div>
                <p class="eyebrow">Sobre o QECR</p>
                <h2 id="cefr-heading">O que é o QECR?</h2>
                <p style="color:var(--color-text-muted);">O Quadro Europeu Comum de Referência para Línguas (QECR — em inglês, CEFR) é o padrão internacional usado para descrever o nível de proficiência em um idioma, do A1 (iniciante) ao C2 (proficiência). É a mesma escala usada por exames como o CELPE-Bras, TOEFL e Cambridge, o que torna seu progresso aqui comparável e reconhecível em qualquer contexto acadêmico ou profissional.</p>
            </div>
            <div class="card card--feature">
                <h2 style="font-size:var(--step-0);">Os sete níveis</h2>
                <ul class="objectives-list"><li>{check}<span>Pre-A1 / A1 — Iniciante: sobrevivência e presente</span></li><li>{check}<span>A2 / B1 — Elementar/Intermediário: passado e subjuntivo</span></li><li>{check}<span>B2 / C1 — Avançado: registro formal e leitura autêntica</span></li><li>{check}<span>C2 — Proficiência quase nativa</span></li></ul>
            </div>
        </div>
    </section>""".replace("{check}", CHECK_SVG)

    skills_section = f"""<section id="habilidades" class="section section--surface" aria-labelledby="skills-heading">
        <div class="section__inner">
            <p class="eyebrow">Habilidades</p>
            <h2 id="skills-heading">O Que Você Vai Praticar</h2>
            <div class="grid">{skill_cards_html()}</div>
        </div>
    </section>"""

    why_us = "".join(f'<li>{CHECK_SVG}<span>{w}</span></li>' for w in WHY_US)
    why_section = f"""<section id="porque-nos" class="section section--tight" aria-labelledby="why-heading">
        <div class="section__inner section__inner--narrow">
            <p class="eyebrow">Por que estudar aqui</p>
            <h2 id="why-heading">Uma Academia Feita Para Quem Estuda Sozinho</h2>
            <ul class="objectives-list">{why_us}</ul>
        </div>
    </section>"""

    cta_band = f"""<section class="cta-band">
        <p class="eyebrow">Pronto para começar?</p>
        <h2>Sua primeira lição de português leva menos de dez minutos.</h2>
        <p>Comece pelo Pre-A1 se você nunca estudou português, ou faça o teste de nivelamento para encontrar seu ponto de partida.</p>
        <div class="hero__actions">
            <a class="btn btn--accent" href="niveis/pre-a1.html">Começar pelo Pre-A1 {ARROW_SVG}</a>
            <a class="btn btn--ghost" href="teste-de-nivelamento.html">Fazer o teste de nivelamento</a>
        </div>
    </section>"""

    body = hero + grammar_section + about_cefr + skills_section + why_section + cta_band

    html_out = (
        site_chrome.head(rel, title, description)
        + site_chrome.header(rel, "", breadcrumb)
        + body
        + site_chrome.footer(rel)
    )

    (ROOT / "index.html").write_text(html_out, encoding="utf-8")
    print("wrote index.html")


if __name__ == "__main__":
    main()
