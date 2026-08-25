#!/usr/bin/env python3
"""
Gera os dois índices de dados estáticos que o site consome em tempo de
execução:

  assets/data/search-index.json         -- assets/js/search.js
  assets/data/exercise-items-index.json -- assets/js/today-review.js
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
import site_chrome  # noqa: E402

# Item types that assets/js/exercises.js actually grades and dispatches
# "exercise:submitted" with an itemId for -- i.e. everything except
# "writing", which has no grading/submit step at all.
GRADEABLE_TYPES = {
    "multiple-choice", "true-false", "fill-blank", "matching",
    "ordering", "correction", "typing", "reading-comprehension", "vocabulary",
}


def load_index():
    with open(ROOT / "curriculum" / "index.json", encoding="utf-8") as f:
        return json.load(f)


def slug_from_id(lesson_id, level_code):
    prefix = level_code.lower() + "-"
    return lesson_id[len(prefix):] if lesson_id.startswith(prefix) else lesson_id


def all_published_lessons(index):
    for level_code, _, level_slug in site_chrome.LEVELS:
        lv = index["levels"].get(level_code.upper(), {})
        for unit in lv.get("units", []):
            for entry in unit["lessons"]:
                if entry["status"] != "published":
                    continue
                path = ROOT / "curriculum" / level_slug / f"{entry['id']}.json"
                lesson = json.load(open(path, encoding="utf-8"))
                slug = slug_from_id(entry["id"], level_code.upper())
                url = f"niveis/{level_slug}/{slug}.html"
                yield level_code.upper(), level_slug, lesson, url


def build_search_index():
    index = load_index()
    entries = []

    entries.append({"type": "page", "level": "", "title": "Início", "desc": "Página inicial da Academia de Português Brasileiro.", "url": "index.html"})
    entries.append({"type": "page", "level": "", "title": "Exercícios", "desc": "Todos os exercícios interativos, organizados por habilidade.", "url": "exercicios.html"})
    entries.append({"type": "page", "level": "", "title": "Teste de Nivelamento", "desc": "Descubra por qual nível começar.", "url": "teste-de-nivelamento.html"})
    entries.append({"type": "page", "level": "", "title": "Verbos Irregulares", "desc": "Tabela de referência dos verbos irregulares mais comuns.", "url": "verbos-irregulares.html"})
    entries.append({"type": "page", "level": "", "title": "Dicionário", "desc": "Busque palavras em dicionários de português confiáveis.", "url": "dicionario.html"})
    entries.append({"type": "page", "level": "", "title": "Revisão de Hoje", "desc": "Repetição espaçada dos itens que você já praticou.", "url": "revisao-de-hoje.html"})
    entries.append({"type": "page", "level": "", "title": "Progresso", "desc": "Seu XP, sequência de estudo e conquistas.", "url": "progresso.html"})

    for level_code, name, slug in site_chrome.LEVELS:
        entries.append({
            "type": "level", "level": level_code, "title": f"{level_code} — {name}",
            "desc": f"Todas as lições do nível {level_code}.", "url": f"niveis/{slug}.html",
        })

    for level_code, level_slug, lesson, url in all_published_lessons(index):
        entries.append({
            "type": "lesson", "level": level_code, "title": lesson["title"],
            "desc": lesson["subtitle"], "url": url,
            "keywords": [lesson["skill"]],
        })

    out_path = ROOT / "assets" / "data" / "search-index.json"
    out_path.write_text(json.dumps(entries, ensure_ascii=False, indent=None), encoding="utf-8")
    print(f"wrote {out_path.relative_to(ROOT)} ({len(entries)} entries)")


def build_exercise_items_index():
    index = load_index()
    out = {}
    for level_code, level_slug, lesson, url in all_published_lessons(index):
        for ex in lesson["exercises"]:
            ex_type = ex["type"]
            if ex_type == "writing":
                continue
            for item in ex.get("items", []):
                if ex_type not in GRADEABLE_TYPES:
                    continue
                entry = dict(item)
                entry["exerciseType"] = ex_type
                entry["exerciseId"] = ex["id"]
                entry["exerciseTitle"] = ex.get("title", "")
                entry["exerciseInstructions"] = ex.get("instructions", "")
                entry["lessonId"] = lesson["id"]
                entry["lessonTitle"] = lesson["title"]
                entry["level"] = level_code
                entry["lessonUrl"] = url
                out[item["id"]] = entry

    out_path = ROOT / "assets" / "data" / "exercise-items-index.json"
    out_path.write_text(json.dumps(out, ensure_ascii=False, indent=None), encoding="utf-8")
    print(f"wrote {out_path.relative_to(ROOT)} ({len(out)} items)")


def main():
    build_search_index()
    build_exercise_items_index()


if __name__ == "__main__":
    main()
