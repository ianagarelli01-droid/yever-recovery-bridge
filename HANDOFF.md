# Yever Recovery Bridge — HANDOFF

Documento de transferência de contexto. Leia isto **antes** de qualquer ação se você está abrindo uma sessão nova neste projeto.

---

## 1. Em uma frase

Backend Node.js que recupera carrinho abandonado de uma loja Shopify cujo checkout principal roda na **Yever** — porque Shopify Flow não vê o checkout abandonado da Yever, então a recuperação precisa ser feita por fora, com webhooks da Yever e mensagem via **Octadesk** (WhatsApp).

## 2. Em qual fase estamos

**Fase 1 (atual): apenas captura.**
O servidor recebe webhooks da Yever e grava o payload completo em arquivo, para podermos inspecionar quais eventos a Yever manda e qual é o formato real. **Ainda não envia mensagem nem mexe na Shopify.**

Fase 2 (próxima, depois que tivermos pelo menos 1 payload de carrinho abandonado e 1 de pedido pago): banco de dados, job de recuperação 1h, envio Octadesk com idempotência e dry-run.

Fase 3: consultar Shopify antes de enviar, pra não mandar mensagem pra cliente que já comprou por outro caminho.

## 3. O que está pronto e funcionando

- Repositório GitHub: <https://github.com/ianagarelli01-droid/yever-recovery-bridge>
- Deploy Railway: <https://yever-recovery-bridge-production.up.railway.app>
- Endpoint healthcheck: `GET /health` → `{"status":"ok",...}`
- Endpoint webhook: `POST /webhooks/yever` → `{"received":true}` e grava o payload em `logs/payloads/<timestamp>-<id>.json`
- Volume Railway montado em `/app/logs` para persistir os payloads entre redeploys (confirmar se o usuário criou no painel)
- Auto-deploy: cada `git push` no `main` redepLOYa
- `.env` local com token Yever e credenciais Octadesk (gitignored, NUNCA commitar)
- `.env.example` documentando os nomes das variáveis (sem valores)
- Scripts de probe em `scripts/`:
  - `scripts/check-railway.js` — testa `/health` e POST de teste
  - `scripts/yever-probe.js` — sonda endpoints GET da API Yever, mascarando o token

## 4. Estrutura de arquivos

```
yever-recovery-bridge/
├── package.json              # express + dotenv; script "start"
├── railway.json              # builder Nixpacks, healthcheck /health
├── .dockerignore
├── .gitignore                # cobre .env, node_modules, logs/payloads/*.json
├── .env.example              # nomes das variaveis, todos vazios
├── .env                      # LOCAL APENAS, com valores reais (NAO commitar)
├── README.md                 # como rodar local + deploy Railway
├── HANDOFF.md                # ESTE arquivo
├── src/
│   └── server.js             # Express + endpoints + logger
├── scripts/
│   ├── README.md
│   ├── check-railway.js
│   └── yever-probe.js
└── logs/
    ├── access.log            # gerado em runtime
    └── payloads/             # 1 .json por webhook recebido (gitignored)
```

## 5. Variáveis de ambiente

Lista canonica (ver `.env.example` para descrição completa). **Os valores reais NÃO ficam aqui** — estão no `.env` local do usuário e nas Variables do serviço Railway.

| Nome | Usado na Fase 1? | Origem | Onde definir |
|---|---|---|---|
| `PORT` | sim (default 3000) | infra | local: `.env`; Railway: deixa vazio (injeta) |
| `YEVER_API_TOKEN` | não (auxiliar) | painel Yever (Configuração → API → Novo token) | `.env` local + Railway Variables |
| `YEVER_WEBHOOK_SECRET` | não (a Yever não documenta segredo) | a confirmar com Yever | provavelmente fica vazio |
| `OCTADESK_API_KEY` | não (Fase 2) | Octadesk | `.env` local + Railway Variables |
| `OCTADESK_BASE_URL` | não (Fase 2) | Octadesk | `https://o223219-9a0.api002.octadesk.services` |
| `OCTADESK_ORIGIN_PHONE` | não (Fase 2) | fixo | `+5511923732847` |
| `OCTADESK_TEMPLATE_REC_1H` | não (Fase 2) | a definir | preencher quando o template for aprovado |
| `DATABASE_URL` | não (Fase 2) | a definir | Postgres do Railway na Fase 2 |

## 6. Restrições e lições aprendidas (importantes)

1. **API da Yever é READ-ONLY.** A doc oficial (`https://docs.yever.com.br/developers/index.html`) diz textualmente que *"todos os endpoints utilizam o método GET"*. Implicação: **NÃO é possível criar/atualizar webhook via API**. A configuração de webhook é obrigatoriamente manual no painel Yever (Configurações → Webhook → Novo webhook). Use a API só para **consulta** (ex.: confirmar se um pedido está pago antes de enviar mensagem).
2. **Base URL Yever**: `https://api.yever.com.br/api/v1`. Auth: `Authorization: Bearer <token>`. Token formato Sanctum: `<id>|<hash>`.
3. **Endpoint exemplo confirmado**: `GET /order/list`. Outros endpoints (carts, checkouts) ainda **não foram mapeados** — rodar `scripts/yever-probe.js` para descobrir.
4. **Yever provavelmente NÃO assina os webhooks** (a doc não menciona segredo HMAC). Quando o primeiro POST real chegar, inspecionar headers para confirmar.
5. **Volume Railway**: sem volume mounted em `/app/logs`, os payloads são perdidos a cada redeploy. Confirmar que existe.
6. **Não inventar nome de evento da Yever.** Logar tudo, classificar depois.
7. **Sandbox do agente** (do Claude/Cowork) só consegue acessar uma allow-list de domínios (npm, github, anthropic). Não consegue chamar `yever.com.br` nem `railway.app` diretamente. Por isso scripts em `scripts/` que o **usuário** executa localmente.
8. **Telefone**: Yever pode mandar em vários formatos. Na Fase 2, normalizar para `+55DDDNNNNNNNN` antes de enviar pra Octadesk.

## 7. O que falta na Fase 1 (ações pendentes do usuário)

1. **Confirmar Volume no Railway** em `/app/logs` (Settings → Volumes).
2. **Cadastrar webhook no painel Yever** (Configurações → Webhook → Novo webhook):
   - Nome: `recovery`
   - URL: `https://yever-recovery-bridge-production.up.railway.app/webhooks/yever`
   - Pedidos: Ativo
   - Carrinho: Ativo
3. **Disparar testes**: abandonar pelo menos 1 carrinho de teste e finalizar 1 compra de teste.
4. **Coletar pelo menos um payload de cada tipo** em `logs/payloads/` (via Railway Logs, Railway CLI `railway run -- ls -lt /app/logs/payloads`, ou volume browser).
5. **Compartilhar esses payloads** com a próxima sessão (basta colar o conteúdo de 1 carrinho abandonado e 1 pedido pago).
6. (Opcional, recomendado) Rodar `node scripts/check-railway.js` e `node scripts/yever-probe.js` localmente e colar a saída — isso confirma que o Railway responde e mapeia os endpoints da API Yever.

## 8. Plano da Fase 2 (a fazer — só começar quando tivermos os payloads reais)

Mantém o servidor da Fase 1 rodando + adiciona em cima:

1. **Banco** (SQLite local em dev / Postgres no Railway em prod). Tabela `checkouts`:
   - `yever_checkout_id` (PK), `name`, `phone_e164`, `email`, `value`, `products` (json), `recovery_url`, `status` (`pending`|`paid`|`recovered_message_sent`|`ignored`), `created_at`, `paid_at`, `message_sent_at`, `octadesk_response` (json).
2. **Roteador de webhook**: a partir do payload real, identificar evento de carrinho criado vs. pagamento. Continuar gravando o payload bruto em `logs/payloads/` para auditoria, mas também gravar em `checkouts`.
3. **Serviço de normalização de telefone** (BR): aceita variações e devolve `+55DDDNNNNNNNN` ou `null`.
4. **Job de recuperação 1h** (cron in-process com `node-cron`): a cada N minutos, busca `status=pending` com `created_at < now-1h` e que ainda não receberam mensagem.
5. **Validações antes de enviar**: not paid, no message sent, telefone válido, sem checkout mais novo do mesmo email/telefone.
6. **Cliente Octadesk** (`POST /chat/send-template` com `X-API-KEY`). Suportar `DRY_RUN=true` (não chama, só loga).
7. **Idempotência**: chave `yever_checkout_id` + flag `message_sent_at` impedem reenvio.
8. **Logs detalhados** (winston ou pino) com `checkout_id` em todas as linhas.

## 9. Plano da Fase 3

Antes de enviar mensagem na Fase 2, consultar Shopify Admin API para verificar se existe pedido pago para esse email/telefone na janela de tempo do checkout. Se houver, marcar `status=ignored` e **não enviar**. Isso evita mensagem para cliente que comprou por outro caminho (ex.: pagou via PIX direto, ou comprou em outra plataforma).

## 10. Comandos úteis

Local:
```bash
# instalar deps
npm install

# rodar servidor local (porta 3000 por padrao)
npm start

# rodar com reload automatico
npm run dev

# testar Railway publicado
node scripts/check-railway.js

# sondar API Yever (mascara o token)
node scripts/yever-probe.js
```

Git:
```bash
# qualquer mudanca: commit + push -> Railway redepLOYa sozinho
git add .
git commit -m "..."
git push
```

Railway (CLI):
```bash
# ver logs ao vivo
railway logs

# listar arquivos no volume montado
railway run -- ls -lt /app/logs/payloads

# baixar um payload especifico
railway run -- cat /app/logs/payloads/<arquivo>.json
```

## 11. Como abrir uma sessão nova com contexto completo

Cole isto na primeira mensagem da nova sessão:

> Estou continuando o projeto `yever-recovery-bridge`. Por favor leia `C:\Users\Dev\Documents\Claude\Projects\Recuperação de carrinho\yever-recovery-bridge\HANDOFF.md` para o contexto completo, e depois me diga em qual ponto da seção 7 ("O que falta na Fase 1") estamos e qual é o próximo passo.

Se você já tiver os primeiros payloads reais da Yever, cole também o conteúdo deles na mesma mensagem para acelerar a transição para a Fase 2.

---

_Última atualização: 2026-05-03_
