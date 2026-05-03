# scripts/

Scripts utilitários para testar a infraestrutura do `yever-recovery-bridge`. Nenhum desses scripts altera nada — todos só fazem leituras (GET / OPTIONS) ou um POST inofensivo de teste.

> Pré-requisito: Node 18+ (eles usam `fetch` nativo) e `npm install` já feito na raiz do projeto (para o `dotenv`).

## `check-railway.js`

Faz um `GET /health` e um `POST /webhooks/yever` contra o servidor publicado.

```bash
node scripts/check-railway.js
# ou contra outra base URL:
node scripts/check-railway.js https://seu-dominio.up.railway.app
```

Espera-se:
- `GET /health` → `HTTP 200` com `{"status":"ok",...}`.
- `POST /webhooks/yever` → `HTTP 200` com `{"received":true}`. O payload aparece em `logs/payloads/` (no volume montado no Railway).

## `yever-probe.js`

Sonda combinacões de base URLs candidatas e endpoints comuns da API da Yever, autenticando com `Authorization: Bearer ${YEVER_API_TOKEN}`.

```bash
node scripts/yever-probe.js
```

Características importantes:
- Lê `YEVER_API_TOKEN` do `.env`.
- **Nunca** imprime o token: qualquer ocorrência dele em qualquer string de saída é mascarada.
- Faz **apenas GETs** — não cria, não altera, não deleta nenhum recurso.
- Marca como `[HIT]` qualquer resposta que pareça promissora (200, 401, 403, 422 ou JSON).

A saída desse script é o que precisamos para descobrir:
1. Qual é a base URL real da API da Yever.
2. Se o token autentica via `Authorization: Bearer ...`.
3. Quais endpoints existem para webhooks, pedidos, checkouts e carrinhos.

Se nenhuma base candidata responder, vamos precisar pedir à Yever a documentação ou a base oficial.
