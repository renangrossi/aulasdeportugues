#!/usr/bin/env python3
"""Gera as páginas utilitárias de nível raiz: dicionario.html, exercicios.html,
verbos-irregulares.html, progresso.html, revisao-de-hoje.html e
teste-de-nivelamento.html.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
import site_chrome  # noqa: E402

ARROW_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>'
SEARCH_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>'
BOOK_SVG = '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>'


def write_page(filename, title, description, breadcrumb, body, level_code=""):
    rel = ""
    html_out = (
        site_chrome.head(rel, title, description)
        + site_chrome.header(rel, level_code, breadcrumb)
        + body
        + site_chrome.footer(rel)
    )
    (ROOT / filename).write_text(html_out, encoding="utf-8")
    print(f"wrote {filename}")


# ---------------------------------------------------------------------------
# Dicionário
# ---------------------------------------------------------------------------
DICTIONARIES = [
    ("Dicio", "O dicionário online mais usado no Brasil — definições, sinônimos e conjugação.", "https://www.dicio.com.br/{word}/", True),
    ("Michaelis", "Dicionário Michaelis de português, com exemplos de uso e etimologia.", "https://michaelis.uol.com.br/moderno-portugues/busca/portugues-brasileiro/{word}/", True),
    ("Priberam", "Dicionário Priberam da Língua Portuguesa, com conjugação verbal completa.", "https://dicionario.priberam.org/{word}", True),
    ("Conjugação.com.br", "Tabela de conjugação completa de qualquer verbo, em todos os tempos e modos.", "https://www.conjugacao.com.br/verbo-{word}/", False),
    ("Linguee", "Traduções em contexto português-inglês, com frases reais.", "https://www.linguee.com/portuguese-english/search?query={word}", False),
    ("Reverso Context", "Exemplos de tradução em contexto, português-inglês.", "https://context.reverso.net/translation/portuguese-english/{word}", False),
]


def build_dictionary():
    cards = ""
    for name, desc, tmpl, primary in DICTIONARIES:
        cls = "card card--feature dict-card" if primary else "card dict-card"
        cards += f"""<div class="{cls}" data-url-template="{tmpl}">
                <div class="card__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{BOOK_SVG}</svg></div>
                <h3>{name}</h3>
                <p>{desc}</p>
                <div class="card__foot"><a class="btn btn--ghost dict-card__link" data-dict-link href="{tmpl.replace('{word}', 'casa')}" target="_blank" rel="noopener">Buscar</a></div>
            </div>"""

    body = f"""<div class="page-header">
        <div class="page-header__inner">
            <div class="page-header__text">
                <p class="eyebrow hero__eyebrow">Ferramenta</p>
                <h1>Dicionário</h1>
                <p class="page-header__lede">Digite uma palavra e abra sua definição, conjugação ou tradução direto nos melhores dicionários de português — sem sair daqui.</p>
            </div>
        </div>
    </div>
    <section class="section section--tight">
        <div class="section__inner section__inner--narrow">
            <div class="dict-input-row">
                {SEARCH_SVG}
                <input type="text" class="dict-input" data-dict-word placeholder="Digite uma palavra em português…" aria-label="Palavra para buscar">
            </div>
        </div>
    </section>
    <section class="section section--surface">
        <div class="section__inner">
            <div class="grid">{cards}</div>
        </div>
    </section>"""
    write_page(
        "dicionario.html",
        "Dicionário — Renan, o Professor",
        "Busque qualquer palavra em português em dicionários e ferramentas de tradução confiáveis, direto do site.",
        '<li aria-current="page">Dicionário</li>',
        body,
    )


# ---------------------------------------------------------------------------
# Verbos irregulares
# ---------------------------------------------------------------------------
VERBS = [
    ("ser", "sou", "é", "somos", "são", "sido"),
    ("estar", "estou", "está", "estamos", "estão", "estado"),
    ("ter", "tenho", "tem", "temos", "têm", "tido"),
    ("ir", "vou", "vai", "vamos", "vão", "ido"),
    ("fazer", "faço", "faz", "fazemos", "fazem", "feito"),
    ("poder", "posso", "pode", "podemos", "podem", "podido"),
    ("querer", "quero", "quer", "queremos", "querem", "querido"),
    ("saber", "sei", "sabe", "sabemos", "sabem", "sabido"),
    ("dizer", "digo", "diz", "dizemos", "dizem", "dito"),
    ("ver", "vejo", "vê", "vemos", "veem", "visto"),
    ("dar", "dou", "dá", "damos", "dão", "dado"),
    ("vir", "venho", "vem", "vimos", "vêm", "vindo"),
    ("pôr", "ponho", "põe", "pomos", "põem", "posto"),
    ("trazer", "trago", "traz", "trazemos", "trazem", "trazido"),
    ("ler", "leio", "lê", "lemos", "leem", "lido"),
    ("dormir", "durmo", "dorme", "dormimos", "dormem", "dormido"),
    ("pedir", "peço", "pede", "pedimos", "pedem", "pedido"),
    ("sair", "saio", "sai", "saímos", "saem", "saído"),
    ("vestir", "visto", "veste", "vestimos", "vestem", "vestido"),
    ("ouvir", "ouço", "ouve", "ouvimos", "ouvem", "ouvido"),
]


def build_irregular_verbs():
    rows = "".join(
        f"<tr><td>{v}</td><td>{eu}</td><td>{voce}</td><td>{nos}</td><td>{eles}</td><td>{part}</td></tr>"
        for v, eu, voce, nos, eles, part in VERBS
    )
    body = f"""<div class="page-header">
        <div class="page-header__inner">
            <div class="page-header__text">
                <p class="eyebrow hero__eyebrow">Referência</p>
                <h1>Verbos Irregulares</h1>
                <p class="page-header__lede">Os {len(VERBS)} verbos irregulares mais usados do português, no presente do indicativo e no particípio.</p>
            </div>
        </div>
    </div>
    <section class="section section--tight">
        <div class="section__inner">
            <div class="dict-input-row">
                {SEARCH_SVG}
                <input type="text" class="dict-input" data-verb-filter placeholder="Filtrar por verbo…" aria-label="Filtrar verbos">
            </div>
            <p class="notice mt-lg" data-verb-count><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/></svg>Mostrando todos os {len(VERBS)} verbos.</p>
            <p class="notice mt-lg" data-verb-empty hidden>Nenhum verbo encontrado para "<span data-verb-empty-term></span>".</p>
            <div class="table-scroll">
                <table class="ref-table">
                    <caption>Verbos irregulares — presente do indicativo e particípio</caption>
                    <thead><tr><th>Infinitivo</th><th>eu</th><th>você/ele/ela</th><th>nós</th><th>vocês/eles/elas</th><th>Particípio</th></tr></thead>
                    <tbody data-verb-tbody>{rows}</tbody>
                </table>
            </div>
        </div>
    </section>"""
    html_out = (
        site_chrome.head("", "Verbos Irregulares — Renan, o Professor", "Tabela de referência dos verbos irregulares mais usados do português, com filtro de busca em tempo real.")
        + site_chrome.header("", "", '<li aria-current="page">Verbos Irregulares</li>')
        + body
        + site_chrome.footer("", extra_scripts='<script src="assets/js/irregular-verbs.js"></script>')
    )
    (ROOT / "verbos-irregulares.html").write_text(html_out, encoding="utf-8")
    print("wrote verbos-irregulares.html")


# ---------------------------------------------------------------------------
# Progresso
# ---------------------------------------------------------------------------
def build_progress():
    body = """<div class="page-header">
        <div class="page-header__inner">
            <div class="page-header__text">
                <p class="eyebrow hero__eyebrow">Sua jornada</p>
                <h1>Seu Progresso</h1>
                <p class="page-header__lede">XP, sequência de estudo e conquistas — tudo salvo apenas neste navegador, sem conta e sem servidor.</p>
            </div>
        </div>
    </div>
    <section class="section section--tight">
        <div class="section__inner">
            <div class="progress-stats" id="progress-summary"></div>
        </div>
    </section>
    <section class="section section--surface">
        <div class="section__inner">
            <p class="eyebrow">Por Nível</p>
            <h2>Progresso por Nível</h2>
            <div id="progress-levels"></div>
        </div>
    </section>
    <section class="section section--tight">
        <div class="section__inner">
            <p class="eyebrow">Conquistas</p>
            <h2>Emblemas</h2>
            <ul class="badge-grid badge-grid--page" id="progress-badges"></ul>
        </div>
    </section>
    <section class="section section--surface">
        <div class="section__inner">
            <p class="eyebrow">Tópicos</p>
            <h2>Lições Concluídas</h2>
            <div id="progress-topics"></div>
        </div>
    </section>
    <section class="section section--tight">
        <div class="section__inner section__inner--narrow" style="text-align:center;">
            <button type="button" id="progress-reset-btn" class="btn btn--ghost">Zerar meu progresso</button>
        </div>
    </section>"""
    write_page(
        "progresso.html",
        "Seu Progresso — Renan, o Professor",
        "Acompanhe seu XP, sua sequência de estudo e suas conquistas na Academia de Português Brasileiro.",
        '<li aria-current="page">Progresso</li>',
        body,
    )


# ---------------------------------------------------------------------------
# Revisão de hoje
# ---------------------------------------------------------------------------
def build_today_review():
    body = f"""<div class="page-header">
        <div class="page-header__inner">
            <div class="page-header__text">
                <p class="eyebrow hero__eyebrow">Repetição espaçada</p>
                <h1>Revisão de Hoje</h1>
                <p class="page-header__lede">Um punhado de itens que você já praticou, trazidos de volta na hora certa para grudar de vez na memória.</p>
            </div>
        </div>
    </div>
    <section class="section section--tight">
        <div class="section__inner">
            <div class="notice" id="review-status-box">Carregando sua fila de revisão…</div>
        </div>
    </section>
    <section class="section section--surface">
        <div class="section__inner" id="review-blocks"></div>
    </section>
    <section class="section section--tight">
        <div class="section__inner section__inner--narrow" style="text-align:center;">
            <p style="color:var(--color-text-muted);">Nada para revisar? Complete exercícios em qualquer lição — os itens aparecem aqui automaticamente quando chegar a hora de revisá-los.</p>
            <a class="btn btn--ghost" href="niveis/pre-a1.html">Ir para as lições {ARROW_SVG}</a>
        </div>
    </section>"""
    html_out = (
        site_chrome.head("", "Revisão de Hoje — Renan, o Professor", "Revise, com repetição espaçada, os itens que você já praticou nas suas lições de português.")
        + site_chrome.header("", "", '<li aria-current="page">Revisão de Hoje</li>')
        + body
        + site_chrome.footer("", extra_scripts='<script src="assets/js/mastery.js"></script><script src="assets/js/today-review.js"></script>')
    )
    (ROOT / "revisao-de-hoje.html").write_text(html_out, encoding="utf-8")
    print("wrote revisao-de-hoje.html")


# ---------------------------------------------------------------------------
# Exercícios (hub)
# ---------------------------------------------------------------------------
def build_exercises_hub():
    index = json.load(open(ROOT / "curriculum" / "index.json", encoding="utf-8"))

    def lessons_by_skill(skill):
        out = []
        for level_code, _, level_slug in site_chrome.LEVELS:
            lv = index["levels"].get(level_code.upper(), {})
            for unit in lv.get("units", []):
                for entry in unit["lessons"]:
                    if entry["status"] != "published":
                        continue
                    lesson_path = ROOT / "curriculum" / level_slug / f"{entry['id']}.json"
                    lesson = json.load(open(lesson_path, encoding="utf-8"))
                    if lesson["skill"] == skill:
                        slug = entry["id"][len(level_slug) + 1:]
                        out.append((level_code, lesson["title"], f"niveis/{level_slug}/{slug}.html"))
        return out

    skill_labels = [
        ("grammar", "Gramática"), ("vocabulary", "Vocabulário"), ("pronunciation", "Pronúncia"),
        ("reading", "Leitura"), ("functional", "Uso Prático"),
    ]
    sections = ""
    for skill_key, skill_label in skill_labels:
        items = lessons_by_skill(skill_key)
        if not items:
            continue
        cards = "".join(
            f'<article class="lesson-card"><span class="lesson-card__index">{lvl}</span><h3><a class="lesson-card__title-link" href="{url}">{title}</a></h3></article>'
            for lvl, title, url in items
        )
        sections += f"""<section class="section section--surface" aria-labelledby="sk-{skill_key}">
        <div class="section__inner">
            <p class="eyebrow">{skill_label}</p>
            <h2 id="sk-{skill_key}">Exercícios de {skill_label}</h2>
            <div class="grid">{cards}</div>
        </div>
    </section>"""

    body = f"""<div class="page-header">
        <div class="page-header__inner">
            <div class="page-header__text">
                <p class="eyebrow hero__eyebrow">Prática</p>
                <h1>Exercícios</h1>
                <p class="page-header__lede">Todas as lições interativas do site, organizadas por habilidade — ou acesse o Teste de Nível e a Revisão de Hoje para praticar de forma direcionada.</p>
            </div>
        </div>
    </div>
    <section class="section section--tight">
        <div class="section__inner">
            <div class="grid">
                <a class="level-card" href="teste-de-nivelamento.html"><span class="level-card__code">1</span><span class="level-card__name">Teste de Nível</span><p>Descubra por onde começar.</p><span class="level-card__link">Fazer o teste {ARROW_SVG}</span></a>
                <a class="level-card" href="revisao-de-hoje.html"><span class="level-card__code">2</span><span class="level-card__name">Revisão de Hoje</span><p>Repetição espaçada do que você já estudou.</p><span class="level-card__link">Revisar agora {ARROW_SVG}</span></a>
                <a class="level-card" href="verbos-irregulares.html"><span class="level-card__code">3</span><span class="level-card__name">Verbos Irregulares</span><p>Tabela de referência com filtro de busca.</p><span class="level-card__link">Consultar {ARROW_SVG}</span></a>
            </div>
        </div>
    </section>
    {sections}"""
    write_page(
        "exercicios.html",
        "Exercícios — Renan, o Professor",
        "Todos os exercícios interativos de português brasileiro, organizados por habilidade: gramática, vocabulário, leitura e mais.",
        '<li aria-current="page">Exercícios</li>',
        body,
    )


# ---------------------------------------------------------------------------
# Teste de nivelamento (placement test)
# ---------------------------------------------------------------------------
PLACEMENT_ITEMS = [
    {"id": "pt1", "prompt": "Eu ___ estudante.", "options": ["sou", "estou", "tenho"], "answerIndex": 0, "explanation": "Identidade/profissão usa \"ser\": eu sou."},
    {"id": "pt2", "prompt": "Nós ___ em São Paulo agora.", "options": ["somos", "estamos", "temos"], "answerIndex": 1, "explanation": "Localização usa \"estar\": nós estamos."},
    {"id": "pt3", "prompt": "___ é o seu nome?", "options": ["Qual", "Quem", "Onde"], "answerIndex": 0, "explanation": "Pergunta específica com \"ser\" usa \"qual\"."},
    {"id": "pt4", "prompt": "Eu ___ (ir) ao trabalho de ônibus.", "options": ["vou", "vai", "vamos"], "answerIndex": 0, "explanation": "Primeira pessoa de \"ir\": vou."},
    {"id": "pt5", "prompt": "As chaves estão ___ (em + a) mesa.", "options": ["na", "no", "da"], "answerIndex": 0, "explanation": "\"Em\" + \"a\" = \"na\"."},
    {"id": "pt6", "prompt": "___ (my, fem.) casa é grande.", "options": ["Minha", "Meu", "Seu"], "answerIndex": 0, "explanation": "\"Casa\" é feminino: minha."},
    {"id": "pt7", "prompt": "Eu ___ (estudar) português todos os dias.", "options": ["estudo", "estuda", "estudam"], "answerIndex": 0, "explanation": "Primeira pessoa de verbos -ar: estudo."},
    {"id": "pt8", "prompt": "Ela ___ (estar + gerúndio: trabalhar) agora.", "options": ["está trabalhando", "trabalha", "trabalhar"], "answerIndex": 0, "explanation": "Ação neste momento usa o presente contínuo."},
    {"id": "pt9", "prompt": "___ dois livros na mesa. (existência)", "options": ["Há", "É", "Sou"], "answerIndex": 0, "explanation": "\"Há\" expressa existência e não varia no plural."},
    {"id": "pt10", "prompt": "Eu moro aqui ___ cinco anos.", "options": ["há", "estou", "sou"], "answerIndex": 0, "explanation": "\"Há\" também expressa tempo decorrido."},
]


def build_placement_test():
    exercise_data = json.dumps({
        "id": "teste-nivelamento",
        "type": "multiple-choice",
        "title": "Teste de Nivelamento",
        "instructions": "Escolha a melhor resposta para cada frase. Ao final, veja sua pontuação e a recomendação de nível abaixo.",
        "items": PLACEMENT_ITEMS,
    }, ensure_ascii=False).replace("</", "<\\/")

    body = f"""<div class="page-header">
        <div class="page-header__inner">
            <div class="page-header__text">
                <p class="eyebrow hero__eyebrow">Por onde começar?</p>
                <h1>Teste de Nivelamento</h1>
                <p class="page-header__lede">Dez perguntas rápidas cobrindo do Pre-A1 ao A1 — o suficiente para saber se você deve começar do zero ou já pode avançar.</p>
            </div>
        </div>
    </div>
    <section class="section section--tight">
        <div class="section__inner">
            <div class="exercise-block"><script type="application/json" class="exercise-data">{exercise_data}</script></div>
        </div>
    </section>
    <section class="section section--surface">
        <div class="section__inner section__inner--narrow">
            <p class="eyebrow">Como interpretar sua pontuação</p>
            <h2>Guia Rápido</h2>
            <ul class="rules-list">
                <li><strong>0 a 3 acertos:</strong> comece pelo <a href="niveis/pre-a1.html">Pre-A1</a> — as bases do idioma ainda precisam de atenção.</li>
                <li><strong>4 a 7 acertos:</strong> você já tem uma boa base — comece pelo <a href="niveis/a1.html">A1</a> e revise o Pre-A1 se sentir necessidade.</li>
                <li><strong>8 a 10 acertos:</strong> parabéns! Você domina o essencial do A1 — revise as últimas lições do A1 e fique de olho nas próximas atualizações do A2.</li>
            </ul>
        </div>
    </section>"""
    write_page(
        "teste-de-nivelamento.html",
        "Teste de Nivelamento — Renan, o Professor",
        "Faça um teste rápido de dez perguntas e descubra por qual nível de português você deve começar a estudar.",
        '<li aria-current="page">Teste de Nível</li>',
        body,
    )


def main():
    build_dictionary()
    build_irregular_verbs()
    build_progress()
    build_today_review()
    build_exercises_hub()
    build_placement_test()


if __name__ == "__main__":
    main()
