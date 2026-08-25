# Esquema dos dados do currículo (v1)

Fonte única de verdade para o conteúdo das lições. Cada lição é um arquivo
JSON em `curriculum/{nivel}/{id-da-licao}.json`, onde `{id-da-licao}` já
inclui o prefixo do nível (ex.: `a1-ser-e-estar.json`). `curriculum/index.json`
lista as unidades de cada nível e os ids de lição que pertencem a cada uma,
em ordem — é isso que permite gerar a página do nível, o índice de busca e
o índice de exercícios em vez de mantê-los à mão.

Este esquema foi desenhado para caber exatamente no padrão de conteúdo que
toda lição do site segue: Objetivos / Explicação / Regras / Exemplos /
Erros Comuns / Exercícios / Resumo / Relacionado. Os itens de `exercises`
seguem exatamente o esquema que `assets/js/exercises.js` já lê (ver o
comentário no topo daquele arquivo) — nada no motor de exercícios muda.

## Formato de uma lição

```jsonc
{
  "id": "a1-ser-e-estar",        // igual ao nome do arquivo gerado
  "level": "A1",                  // "PRE-A1" | "A1" | "A2" | ... | "C2"
  "order": 1,                     // posição dentro da unidade
  "skill": "grammar",             // grammar | vocabulary | pronunciation | reading
                                   // | listening | speaking | writing | functional
  "title": "Ser e Estar",
  "subtitle": "Os dois verbos mais importantes do português — domine-os primeiro.",
  "objectives": [
    "Usar 'ser' e 'estar' corretamente em frases simples",
    "..."
  ],
  "content": {
    "intro": "Um parágrafo curto, mesmo papel do intro em itálico do padrão A1 do site em inglês.",
    "explanation": "<p>...</p>",     // pode ter HTML em linha (strong/em), sem tags de bloco
    "rules": ["Regra 1", "Regra 2"], // lista simples, cada item pode ter HTML em linha
    "table": {                        // opcional — tabela de referência (ex.: conjugação)
      "caption": "Ser — presente do indicativo",
      "headers": ["Pronome", "Forma"],
      "rows": [["eu", "sou"], ["você/ele/ela", "é"]]
    },
    "examples": ["Eu sou professor.", "..."],
    "commonMistakes": [
      { "wrong": "...", "right": "...", "why": "..." }
    ],
    "tip": "Dica opcional mostrada como um aviso ao final da seção de Erros Comuns."
  },
  "exercises": [ /* objetos exercise-data no formato exato de assets/js/exercises.js */ ],
  "summary": ["Uma frase-resumo", "..."],
  "related": [ { "lessonId": "a1-pronomes-pessoais", "label": "Pronomes Pessoais" } ]
}
```

## Formato de `curriculum/index.json`

```jsonc
{
  "levels": {
    "A1": {
      "units": [
        { "id": "1", "title": "Gramática Iniciante (20 lições)", "lessons": [ { "id": "a1-ser-e-estar", "status": "published" } ] }
      ]
    }
  }
}
```

`status` em cada lição é `"published"` (tem uma página HTML gerada e está
linkada na página do nível), `"drafted"` (o JSON existe, ainda não
construído) ou `"planned"` (definido no roteiro pedagógico, ainda sem
JSON). Isso permite acompanhar honestamente o progresso parcial em vez de
o índice fingir que mais coisa está pronta do que realmente está.

## Build

`python3 scripts/build_lesson.py curriculum/{nivel}/{id-da-licao}.json`
gera uma lição em `niveis/{nivel}/{slug-sem-prefixo}.html`, reaproveitando
o mesmo cabeçalho/rodapé de `scripts/site_chrome.py` — assim uma página
gerada fica visualmente idêntica a qualquer outra do site. Rodar sem
argumentos (`python3 scripts/build_lesson.py`) reconstrói todas as lições
listadas em `curriculum/index.json`.
