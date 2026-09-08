# Professor IA — implantação do backend

Esta pasta **não** faz parte do site do GitHub Pages (nada em
`worker/` é referenciado por nenhuma página HTML). É a origem de um
Cloudflare Worker separado que atua como um proxy seguro entre o seu
site e a API da Groq — o único lugar onde a sua chave da API da Groq
fica armazenada.

Portado a partir do `worker/` do projeto irmão em inglês (mesma
arquitetura: CORS, limitação de taxa, chamada à Groq, embasamento no
catálogo do curso) — este é um **Worker separado, implantado de forma
independente**, com seu próprio nome, seu próprio namespace KV e seu
próprio prompt de sistema/catálogo em português brasileiro. Ele não
compartilha estado com os Workers dos cursos de inglês, latim, grego
antigo, espanhol ou italiano, e implantar um não afeta os outros.

## Por que uma implantação separada?

O GitHub Pages só serve arquivos estáticos — não há como manter um
segredo fora do navegador se a chamada de IA acontecesse diretamente
no JavaScript do seu site. O Worker roda nos servidores da Cloudflare,
guarda a chave lá, e o JS do seu site só conversa com o Worker.

## Configuração única (cerca de 15 minutos)

### 1. Crie contas gratuitas (nenhuma requer cartão de crédito)
- **Groq**: [console.groq.com](https://console.groq.com) → cadastre-se → **API Keys** → Create API Key. Copie a chave em um lugar seguro. (Se você já implantou o Worker de outro curso, pode reaproveitar a mesma conta/chave da Groq — a cota gratuita da Groq é compartilhada por conta de qualquer forma, então leve isso em conta ao ajustar `DAILY_LIMIT_PER_ANON` abaixo.)
- **Cloudflare**: [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up) → cadastre-se, ou reaproveite a conta que você já criou para o Worker de outro curso — uma conta Cloudflare pode hospedar vários Workers independentes.

### 2. Instale o Wrangler (a ferramenta de deploy da Cloudflare)
```bash
npm install -g wrangler
wrangler login
```
Isso abre uma janela do navegador para conectar o Wrangler à sua conta Cloudflare. Pule esta etapa se você já fez isso para o Worker de outro curso — é a mesma conta/ferramenta.

### 3. Crie o namespace KV (usado para os contadores de limite de taxa)
```bash
cd worker
wrangler kv namespace create AI_TEACHER_KV
```
Isso imprime algo como:
```
id = "abcd1234..."
```
Copie esse valor de `id` para dentro de `wrangler.toml`, substituindo `REPLACE_WITH_YOUR_KV_NAMESPACE_ID`. **Não reaproveite o namespace KV de outro curso** — cada curso precisa do seu próprio, para que os contadores de limite de taxa (e as cotas diárias) fiquem independentes.

### 4. Defina sua chave da API da Groq como um secret (nunca commitado no git)
```bash
wrangler secret put GROQ_API_KEY
```
Cole sua chave da Groq quando solicitado (pode ser a mesma chave de outro curso, ou uma separada). Isso a armazena criptografada do lado da Cloudflare — ela nunca é escrita em nenhum arquivo deste repositório.

### 5. Confirme a origem permitida
Abra `worker.js` e verifique o topo do arquivo:
```js
const ALLOWED_ORIGIN = "https://renangrossi.github.io";
```
Isso é só o esquema+host do GitHub Pages — o mesmo valor funciona para qualquer repositório/página de projeto dessa conta, então já está correto para `aulasdeportugues`. Atualize apenas se o site for para um domínio próprio.

### 6. Faça o deploy
```bash
wrangler deploy
```
Isso imprime a URL real do seu Worker, algo como:
```
https://ai-teacher-pt.<seu-subdominio-de-conta>.workers.dev
```
Note que o worker se chama `ai-teacher-pt` (veja `wrangler.toml`) justamente para não colidir com os Workers dos outros cursos, se todos forem implantados na mesma conta Cloudflare.

### 7. Aponte o site para o seu Worker
Atualize `AI_TEACHER_WORKER_URL` em `scripts/site_chrome.py` (perto do topo do arquivo, junto de `AI_TEACHER_ENABLED`) para a URL real impressa no Passo 6, depois mude:
```python
AI_TEACHER_ENABLED = True
```
Em seguida reconstrua o site inteiro para que cada página receba as duas mudanças:
```bash
python3 scripts/build_lesson.py
python3 scripts/build_level_page.py
python3 scripts/build_home.py
python3 scripts/build_utility_pages.py
python3 scripts/build_data_indexes.py
```
Faça commit e push como de costume — o widget de chat vai aparecer em todas as páginas e vai falar com o seu Worker de verdade.

## Ajustando os limites

No topo de `worker.js`:
- `DAILY_LIMIT_PER_ANON` — perguntas por navegador por dia (padrão: 20).
- `BURST_LIMIT_PER_IP` / `BURST_WINDOW_SECONDS` — freio de curto prazo contra abuso (padrão: 8 requisições/60s por IP).
- `MAX_MESSAGE_LENGTH` — tamanho máximo de pergunta aceito (mantenha sincronizado com o `maxlength` do textarea renderizado por `scripts/site_chrome.py`, caso mude).

## Catálogo do curso (`course-catalog.json`)

Para que o Professor IA possa recomendar um link de lição *real* em
vez de inventar um, `worker.js` importa `course-catalog.json` — uma
lista de cada página real do curso (as 7 páginas de visão geral de
nível e as 73 páginas de lição) com suas URLs reais no site. A cada
requisição, o Worker faz uma correspondência de palavras-chave
determinística (sem IA) entre a mensagem do aluno (mais o histórico
recente) e esse catálogo, e só entrega ao modelo as URLs que
resultarem dessa correspondência — o modelo é instruído a nunca
produzir uma URL que não tenha sido fornecida a ele naquele turno,
então é estruturalmente incapaz de inventar uma.

**Nota**: ao contrário de alguns cursos irmãos, este curso ainda não
tem uma página de revisão cumulativa "teste-se" por nível — cada
página de lição já traz seus próprios exercícios. O prompt do sistema
já está instruído sobre essa diferença.

**Gerado uma vez raspando os `<h1>`/`href`s reais de `niveis/*/​*.html`, sem reconstrução automática depois disso.** Se você adicionar, renomear ou mover uma lição/página de nível, atualize `course-catalog.json` manualmente.

Cada entrada:
```json
{ "level": "A1", "title": "Adjetivos e Concordância", "url": "niveis/a1/adjetivos-e-concordancia.html", "type": "lesson" }
```
- `url` é relativa à raiz do site (sem barra inicial, sem domínio) — o Worker a resolve contra `SITE_BASE_URL` em `worker.js`.
- `type` é `"lesson"` (uma página de lição de nível — explicação gramatical E seus próprios exercícios juntos) ou `"page"` (páginas utilitárias do site: Exercícios, Dicionário, Teste de Nível, Verbos Irregulares, Revisão de Hoje, Meu Progresso).
- `level` é o código de nível do QECR (`"Pre-A1"`–`"C2"`), ou `null` para uma entrada do tipo `"page"` que não é específica de nível.
- `aliases` opcional: termos de busca extras (sinônimos em inglês/espanhol) para tópicos em que a formulação do aluno não compartilha palavras com o título em português do site — nenhum está pré-preenchido ainda; adicione manualmente para tópicos que você perceber que o buscador de palavras-chave está perdendo na prática.

Depois de editar o catálogo, reimplante com `wrangler deploy` (ele é empacotado no Worker no momento do deploy, não é buscado em tempo de execução).

## Quais dados são enviados/armazenados

- A mensagem do aluno e a conversa atual (mantidas apenas na memória da aba do navegador, perdidas ao recarregar) são enviadas ao Worker, e depois à Groq, para gerar uma resposta.
- O Worker não armazena nada além de dois pequenos contadores de limite de taxa no KV: um ID anônimo (uma string aleatória gerada no navegador, sem informação pessoal) mais uma contagem de requisições, ambos expirando automaticamente após 24 horas ou 60 segundos.
- Segundo os termos da Groq (vale a pena reconferir em console.groq.com antes de confiar nisso a longo prazo), requisições do tier gratuito podem ser registradas para monitoramento de abuso; nada aqui tem privacidade garantida, então o frontend também avisa os alunos para não compartilharem informações pessoais.

## Realidade do tier gratuito

O tier gratuito do `openai/gpt-oss-120b` da Groq é de aproximadamente
1.000 requisições/dia **compartilhadas entre todos os visitantes do
seu site**, não por aluno — e se você estiver usando a *mesma* conta/
chave da Groq entre vários cursos, essa cota é compartilhada entre
todos eles também. O Worker automaticamente recorre ao modelo
`openai/gpt-oss-20b` (também ~1.000 requisições/dia, mas em um pool de
cota separado) se a cota diária do modelo principal já tiver sido
usada, então o recurso continua funcionando com qualidade um pouco
menor em vez de parar de funcionar completamente. O limite diário por
navegador (`DAILY_LIMIT_PER_ANON`) existe justamente para impedir que
um único visitante consuma toda a cota compartilhada do dia.
