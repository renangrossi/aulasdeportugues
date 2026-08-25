# Gamificação — como funciona

Todo o sistema de progresso (`assets/js/progress.js`) e de repetição
espaçada (`assets/js/mastery.js`) é **100% local ao navegador**: nenhum
dado sai do dispositivo do aluno, não há conta, não há servidor. Isso
mantém o site inteiramente estático e gratuito no GitHub Pages.

## Armazenamento

Dois módulos, duas chaves de `localStorage`, prefixadas com `apt_`
("Academia de Português") para não colidir com o site-irmão em inglês —
GitHub Pages de páginas de projeto sob o mesmo usuário (`renangrossi.
github.io/englishclasses/` e `.../aulasdeportugues/`) compartilham a
mesma origem, logo o mesmo `localStorage`.

- `apt_progress` — XP, sequência de dias, emblemas, exercícios já
  feitos, páginas concluídas, uso do dicionário.
- `apt_mastery` — histórico de acertos/erros por item de exercício,
  usado pela fila de "Revisão de Hoje".

## XP

| Ação | XP |
| --- | --- |
| Primeira vez que um bloco de exercício é enviado | 10 |
| Bônus por 100% de acerto nesse bloco | +5 |
| Concluir todos os exercícios de uma lição (emblema de tópico) | 20 |
| Concluir o Teste de Nivelamento | 40 |
| Primeira atividade de um novo dia (bônus diário) | 5 |

Reenvios de um exercício já concluído nunca dão XP de novo — apenas
atualizam o melhor resultado salvo.

## Emblemas

Definidos em `BADGES` dentro de `progress.js`. Cada um tem um `id`, um
`check(state)` que decide quando desbloquear, e uma entrada correspondente
em `BADGE_XP` com o bônus de XP concedido na primeira vez. Para adicionar
um emblema novo: acrescente um objeto a `BADGES` e uma entrada em
`BADGE_XP` — nada mais precisa mudar.

Emblemas de nível ("Exploradora(or) A1", etc.) são gerados automaticamente
a partir de `LEVELS`, com o limiar calculado por `explorerThreshold()` —
30% do total de exercícios daquele nível, definido em
`LEVEL_EXERCISE_COUNTS`. **Atualize essa tabela sempre que novas lições
forem publicadas** em um nível, rodando `scripts/build_data_indexes.py` e
contando os blocos de exercício de `curriculum/{nivel}/*.json`.

## Emblemas de tópico

Diferente da lista fixa de `BADGES`, um emblema de tópico é concedido a
cada lição individual totalmente concluída (`state.topicsCompleted`),
sem precisar editar código — `maybeCompleteTopic()` detecta isso pela
URL da página automaticamente.

## Repetição espaçada (`mastery.js`)

Cada item de exercício respondido tem seu próprio registro:
`attempts`, `correctCount`, `consecutiveCorrect`, `dueAt`,
`masteryStatus` (`new` / `learning` / `mastered`). Um item só vira
`mastered` depois de dois acertos consecutivos em dias diferentes — a
régua deliberadamente mais rígida que "acertou uma vez".

`revisao-de-hoje.html` lê `getDueItemIds()`, procura cada id em
`assets/data/exercise-items-index.json` (gerado por
`scripts/build_data_indexes.py` a partir de todo `curriculum/*/*.json`),
agrupa por nível + tipo de exercício, e entrega ao mesmo motor de
exercícios (`window.ExerciseEngine`) que qualquer lição usa — nenhuma
lógica de correção é duplicada.

## Ajustando o tempo dos toasts

`TOAST_VISIBLE_MS` e `TOAST_EXIT_MS`, no topo de `progress.js`, controlam
quanto tempo um toast de "+XP"/emblema fica visível antes de desaparecer.
Mantenha `TOAST_EXIT_MS` sincronizado com a transição CSS de
`.xp-toast` em `components.css` se um dos dois mudar.
