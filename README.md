# Renan, o Professor — Academia de Português Brasileiro

Curso gratuito e estático de português brasileiro, alinhado ao QECR
(Pre-A1 a C2), com centenas de exercícios interativos corrigidos no
próprio navegador. Site-irmão de
[englishclasses](https://github.com/renangrossi/englishclasses) — mesma
filosofia ($0, GitHub Pages, sem backend), arquitetura adaptada e
reconstruída inteiramente para o português.

**Ao vivo:** https://renangrossi.github.io/aulasdeportugues/

## Estado atual

- **Pre-A1, A1, A2, B1, B2 e C1 estão 100% publicados**: 68 lições,
  208 blocos de exercícios, 440 itens corrigíveis automaticamente.
- **C2 tem o roteiro pedagógico completo definido** em
  `curriculum/index.json` (status `"planned"`), com a página de nível
  já no ar mostrando cada tópico como "Em breve" — não é uma promessa
  vaga, é a lista real do que vem a seguir.
- Sem "AI Teacher" (Cloudflare Worker + LLM) nesta fase — pode ser
  adicionado depois, do mesmo jeito que no site em inglês, se fizer
  sentido no futuro.
- Sem áudio pré-gravado: os botões de "Ouvir" usam a Web Speech API do
  próprio navegador (`assets/js/listening.js`) — grátis, sem arquivos.

## Arquitetura

```
curriculum/{nivel}/{id}.json   -- fonte única de verdade de cada lição
curriculum/index.json          -- sequência de unidades/lições por nível
scripts/build_lesson.py        -- curriculum/*.json -> niveis/{nivel}/{slug}.html
scripts/build_level_page.py    -- curriculum/index.json -> niveis/{nivel}.html
scripts/build_home.py          -- index.html
scripts/build_utility_pages.py -- dicionario/exercicios/verbos-irregulares/
                                   progresso/revisao-de-hoje/teste-de-nivelamento
scripts/build_data_indexes.py  -- assets/data/search-index.json e
                                   assets/data/exercise-items-index.json
scripts/site_chrome.py         -- cabeçalho/rodapé/nav compartilhados
```

Todas as páginas HTML deste repositório (exceto os scripts em si) são
**geradas** — não edite `niveis/*.html`, `index.html` ou as páginas
utilitárias diretamente; edite o JSON/Python correspondente e rode:

```bash
python3 scripts/build_lesson.py          # todas as lições
python3 scripts/build_level_page.py      # as 7 páginas de nível
python3 scripts/build_home.py            # index.html
python3 scripts/build_utility_pages.py   # páginas utilitárias
python3 scripts/build_data_indexes.py    # índices de busca e revisão
```

(Ou rode os cinco em sequência — não há dependência entre eles além da
ordem lógica acima.)

### Motor de exercícios

`assets/js/exercises.js` é praticamente idêntico ao do site em inglês —
o motor não sabe nada sobre o idioma do conteúdo, só sobre o formato
JSON de cada exercício (`curriculum/SCHEMA.md` documenta o formato de
lição completo; o formato de cada exercício é o mesmo lido por
`exercises.js`, ver o comentário no topo daquele arquivo).

### Design

`assets/css/tokens.css` define uma identidade brasileira própria — verde-
mata, terracota, ouro e azul-céu sobre superfícies de areia/marfim,
tipografia Lora + Source Sans 3 — usando os mesmos *nomes* de variável
que o restante do sistema de estilos (`base.css`, `components.css`,
`layout.css`, `exercises.css`, `lessons.css`, `search.css`,
`dark-mode.css`) já espera, para que esses arquivos pudessem ser
reaproveitados quase sem alteração.

### Progresso e repetição espaçada

Ver `docs/gamification.md`.

## Publicar no GitHub Pages

Este repositório já está configurado para GitHub Pages a partir da
branch `main`, raiz do repositório (sem Jekyll — ver `.nojekyll`). Basta
dar `git push` na branch `main`; o GitHub reconstrói o site
automaticamente.

## Licença

Todos os direitos reservados — © Renan, o Professor.
