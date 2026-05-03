# Yever Recovery Bridge — Fase 1

Backend mínimo em Node.js + Express cujo único objetivo nesta primeira fase é **receber e registrar os webhooks da Yever** para que possamos inspecionar quais eventos a Yever envia e qual é a estrutura real de cada payload.

> ⚠️ Esta fase **não** envia mensagens pela Octadesk e **não** cria checkout/pedido na Shopify. É puramente captura e logging.

---

## O que esta versão faz

- Sobe um servidor Express na porta definida em `PORT` (padrão `3000`).
- Expõe `GET /health` para healthcheck.
- Expõe `POST /webhooks/yever` para receber qualquer webhook da Yever.
- Salva cada webhook recebido em `logs/payloads/<timestamp>-<id>.json`, contendo:
  - `receivedAt` (ISO 8601)
  - `method`, `url`, `path`, `ip`
  - `query`
  - `headers` completos
  - `rawBody` (string crua exatamente como recebida)
  - `body` (parse JSON/urlencoded quando aplicável)
- Mantém um log de acesso em `logs/access.log`.
- Responde **HTTP 200** rapidamente para a Yever e processa o log de forma assíncrona.

## O que esta versão NÃO faz (de propósito)

- Não envia template via Octadesk.
- Não consulta nem altera nada na Shopify.
- Não interpreta nem faz suposições sobre o nome dos eventos da Yever.
- Não valida assinatura HMAC ainda (o `YEVER_WEBHOOK_SECRET` está reservado para a próxima fase).
- Não tem banco de dados ainda — só arquivos de log.

---

## Estrutura

```
yever-recovery-bridge/
├── package.json
├── .env.example
├── .gitignore
├── README.md
├── src/
│   └── server.js
└── logs/
    ├── access.log         (criado em runtime)
    └── payloads/          (um arquivo .json por webhook recebido)
```

---

## Pré-requisitos

- Node.js **18.17+** (recomendado 20 LTS).
- npm.

---

## Como rodar localmente

1. Clone/baixe o projeto e entre na pasta:

   ```bash
   cd yever-recovery-bridge
   ```

2. Instale as dependências:

   ```bash
   npm install
   ```

3. Crie seu arquivo `.env` a partir do exemplo:

   ```bash
   cp .env.example .env
   ```

   Edite se quiser mudar a porta. O `YEVER_WEBHOOK_SECRET` pode ficar vazio nesta fase.

4. Suba o servidor:

   ```bash
   npm start
   ```

   Para desenvolvimento com reload automático (Node 18.17+):

   ```bash
   npm run dev
   ```

5. Verifique que está vivo:

   ```bash
   curl http://localhost:3000/health
   ```

   Resposta esperada:

   ```json
   { "status": "ok", "timestamp": "..." }
   ```

---

## Como testar o endpoint do webhook

Envie um POST de teste:

```bash
curl -X POST http://localhost:3000/webhooks/yever \
  -H "Content-Type: application/json" \
  -H "X-Test-Header: hello" \
  -d '{"evento":"teste","cliente":{"nome":"Fulano","telefone":"11999999999"}}'
```

Você deve receber:

```json
{ "received": true }
```

E um novo arquivo deve aparecer em `logs/payloads/`, por exemplo:

```
logs/payloads/2026-05-03T18-31-22-123Z-9f2a1b3c.json
```

Inspecionando esse arquivo, você verá método, headers, query e body do que foi enviado.

---

## Como expor localmente para a Yever (ngrok)

A Yever precisa conseguir alcançar seu servidor pela internet. Em desenvolvimento, o jeito mais simples é usar o **ngrok** (alternativas equivalentes: `cloudflared tunnel`, `localtunnel`, `tailscale funnel`).

### Usando ngrok

1. Instale o ngrok: <https://ngrok.com/download>
2. (Uma única vez) cadastre seu authtoken:

   ```bash
   ngrok config add-authtoken SEU_TOKEN_AQUI
   ```

3. Com o servidor rodando em `localhost:3000`, em outro terminal:

   ```bash
   ngrok http 3000
   ```

4. Copie a URL `https://<algo>.ngrok-free.app` que o ngrok mostrar e configure na Yever apontando para:

   ```
   https://<algo>.ngrok-free.app/webhooks/yever
   ```

5. Dispare um evento de teste pela Yever (ou refaça uma compra de teste no checkout) e veja o arquivo aparecendo em `logs/payloads/`.

### Alternativa: cloudflared

```bash
cloudflared tunnel --url http://localhost:3000
```

Use a URL pública gerada da mesma forma.

---

## Deploy no Railway (recomendado para receber webhooks de produção)

O projeto já vem pronto para Railway: tem `package.json` com script `start`, escuta em `process.env.PORT` e o `railway.json` define `/health` como healthcheck.

### 1. Subir o código para o GitHub

Na pasta do projeto:

```bash
git init
git add .
git commit -m "feat: yever-recovery-bridge fase 1"
git branch -M main
```

Crie um repositório vazio em <https://github.com/new> (privado, recomendado), e depois:

```bash
git remote add origin git@github.com:<seu-usuario>/yever-recovery-bridge.git
git push -u origin main
```

> O `.env` **não vai** para o GitHub — está coberto pelo `.gitignore`. As credenciais reais ficarão como variáveis de ambiente direto no Railway.

### 2. Criar o serviço no Railway

1. Em <https://railway.app/new>, escolha **Deploy from GitHub repo**.
2. Autorize o Railway a ler seu GitHub e selecione o repo `yever-recovery-bridge`.
3. O Railway detecta Node automaticamente (Nixpacks) e dá deploy. O primeiro build leva ~1 minuto.

### 3. Configurar as variáveis de ambiente

Na aba **Variables** do serviço, cadastre os mesmos nomes que estão no `.env.example`. Para a Fase 1, basta:

| Variável                | Valor                                                                                  |
|-------------------------|----------------------------------------------------------------------------------------|
| `PORT`                  | (deixe em branco — o Railway injeta automaticamente)                                  |
| `YEVER_API_TOKEN`       | seu token Sanctum da Yever                                                             |
| `YEVER_WEBHOOK_SECRET`  | (vazio até a Yever fornecer o segredo de assinatura, se houver)                        |
| `OCTADESK_API_KEY`      | hash da Octadesk (não é usado nesta fase, mas pode já cadastrar)                       |
| `OCTADESK_BASE_URL`     | `https://o223219-9a0.api002.octadesk.services`                                         |
| `OCTADESK_ORIGIN_PHONE` | `+5511923732847`                                                                       |

### 4. Adicionar um Volume para persistir os logs

Os arquivos em `logs/payloads/` precisam sobreviver a redeploys. No Railway:

1. Aba **Settings** → seção **Volumes** → **+ New Volume**.
2. Mount path: `/app/logs`
3. Nome: `logs` (ou o que preferir).

Pronto — todo arquivo gravado em `logs/` (incluindo `logs/payloads/` e `logs/access.log`) fica persistido entre deploys.

### 5. Gerar a URL pública

Aba **Settings** → seção **Networking** → **Generate Domain**.

O Railway vai te dar algo como:

```
https://yever-recovery-bridge-production.up.railway.app
```

Teste:

```bash
curl https://yever-recovery-bridge-production.up.railway.app/health
```

### 6. Cadastrar a URL na Yever

No painel da Yever (Configurações → Webhook → Novo webhook):

- **Nome:** `recovery`
- **URL:**
  ```
  https://yever-recovery-bridge-production.up.railway.app/webhooks/yever
  ```
- **Pedidos:** Ativo
- **Carrinho:** Ativo

### 7. Verificar payloads recebidos

Você tem três jeitos de inspecionar:

- **Logs do Railway** (aba Deployments → Logs): mostra cada `POST /webhooks/yever` e o nome do arquivo gerado.
- **Volume** (via Railway CLI): `railway run -- ls -lt /app/logs/payloads`
- **Endpoint de listagem** (a ser adicionado em uma fase futura, se necessário)

### 8. Workflow para próximas mudanças

Sempre que você der `git push` para o `main`, o Railway faz redeploy automático. Não precisa apertar nada.

---

## Como inspecionar os webhooks salvos

Cada arquivo em `logs/payloads/` é um JSON pretty-printed. Listar os mais recentes:

```bash
ls -lt logs/payloads | head
```

Ver o conteúdo do mais recente (Linux/Mac):

```bash
cat "logs/payloads/$(ls -t logs/payloads | head -1)"
```

No Windows (PowerShell):

```powershell
Get-Content (Get-ChildItem logs\payloads | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
```

---

## Variáveis de ambiente

Veja `.env.example`. Nesta fase apenas `PORT` é efetivamente usada.

| Variável                | Obrigatória nesta fase | Uso                                                                 |
|-------------------------|------------------------|---------------------------------------------------------------------|
| `PORT`                  | não (default 3000)     | Porta do servidor Express.                                          |
| `YEVER_WEBHOOK_SECRET`  | não                    | Reservada para validação HMAC do webhook da Yever na próxima fase.  |

---

## Próximos passos (não fazem parte desta fase)

Depois de coletarmos alguns payloads reais da Yever, a próxima fase implementará:

- Modelo de dados de checkout (SQLite/Postgres) com os campos: `yever_checkout_id`, nome, telefone, e-mail, valor, produtos, URL de recuperação, status (`pending` / `paid` / `recovered_message_sent` / `ignored`), `created_at`, `paid_at`, `message_sent_at`.
- Endpoint separado para webhook de pagamento aprovado.
- Normalização de telefone brasileiro (com `+55`).
- Job recorrente que procura checkouts pendentes com mais de 1 hora.
- Envio de template via Octadesk (`POST /chat/send-template`) com idempotência.
- Modo dry-run (não chama Octadesk de verdade).
- Validação de assinatura do webhook usando `YEVER_WEBHOOK_SECRET`.

E em uma fase posterior:

- Consulta à Shopify antes do envio para evitar mandar mensagem para cliente que comprou por outro caminho.
