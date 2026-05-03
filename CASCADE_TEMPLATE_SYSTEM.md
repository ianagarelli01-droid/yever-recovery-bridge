# 📊 Sistema de Envio em Cascata de Templates

## Visão Geral

O sistema agora implementa envio **automático e progressivo** de mensagens de recuperação baseado no tempo de abandono do carrinho.

```
Carrinho Abandonado
    ↓ (60 minutos)
1️⃣ Enviar template rec_1h (ID: 69f77922782bded6aca472a5)
    ↓ (1440 minutos = 24h)
2️⃣ Enviar template rec_24h (ID: 69f779c3e9513d9e62fa3bdd)
    ↓ (2160 minutos = 36h)
3️⃣ Enviar template rec_cupom_36h (ID: 69f77bb185fa8014cb700242)
```

---

## ⚙️ Como Funciona

### 1. Job Executado a Cada 5 Minutos

```
[recovery-job] ⏰ Iniciando verificação...
├─ 🔄 Processando template 1h...
├─ 🔄 Processando template 24h...
└─ 🔄 Processando template 36h...
```

### 2. Para Cada Template, o Sistema:

1. **Busca checkouts** abandonados há X minutos que **ainda não receberam esse template**
2. **Valida dados**: telefone, email, URL de recuperação
3. **Normaliza telefone** para E.164 (+55...)
4. **Verifica se cliente pagou** QUALQUER carrinho:
   - ✅ Se SIM → Não envia (cliente resolveu)
   - ❌ Se NÃO → Continua
5. **Verifica se há carrinho mais recente** do cliente:
   - ✅ Se SIM → Não envia (cliente criou novo carrinho)
   - ❌ Se NÃO → Envia
6. **Envia via Octadesk** com o template apropriado
7. **Marca como enviado** em `template_1h_sent_at`, `template_24h_sent_at`, ou `template_36h_sent_at`

---

## 🗂️ Estrutura no Banco de Dados

### Campos de Rastreamento

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `template_1h_sent_at` | TIMESTAMP | Quando foi enviado template rec_1h |
| `template_24h_sent_at` | TIMESTAMP | Quando foi enviado template rec_24h |
| `template_36h_sent_at` | TIMESTAMP | Quando foi enviado template rec_36h |

Isso garante **idempotência**: cada template é enviado apenas uma vez.

---

## 📋 Variáveis de Ambiente

```bash
# Templates em cascata
OCTADESK_TEMPLATE_REC_1H=69f77922782bded6aca472a5
OCTADESK_TEMPLATE_REC_24H=69f779c3e9513d9e62fa3bdd
OCTADESK_TEMPLATE_REC_36H=69f77bb185fa8014cb700242

# Outras configurações
OCTADESK_API_KEY=...
OCTADESK_BASE_URL=...
OCTADESK_ORIGIN_PHONE=...
```

---

## 🔍 Exemplo de Fluxo

### Cenário: Cliente abandona carrinho

**T+0min**: Carrinho criado, status = `pending`

**T+60min** (1 hora depois):
```
Job executa
├─ Encontra checkout com abandoned_at < 60min atrás
├─ Valida (telefone OK, email OK, URL OK)
├─ Normaliza: "11987654321" → "+5511987654321"
├─ Verifica: Cliente pagou algo? NÃO ✓
├─ Verifica: Há carrinho mais recente? NÃO ✓
├─ Envia template rec_1h
└─ Marca: template_1h_sent_at = NOW()
```

Status do checkout:
```json
{
  "id": 1,
  "status": "pending",
  "abandoned_at": "2026-05-03T22:00:00Z",
  "template_1h_sent_at": "2026-05-03T23:00:00Z",
  "template_24h_sent_at": null,
  "template_36h_sent_at": null
}
```

**T+1440min** (24 horas depois):
```
Job executa
├─ Encontra checkout com:
│  ├─ abandoned_at < 1440min atrás ✓
│  ├─ template_24h_sent_at IS NULL ✓
├─ Valida (tudo OK)
├─ Verifica: Cliente pagou? NÃO ✓
├─ Envia template rec_24h
└─ Marca: template_24h_sent_at = NOW()
```

**T+2160min** (36 horas depois):
```
Job executa
├─ Encontra checkout com:
│  ├─ abandoned_at < 2160min atrás ✓
│  ├─ template_36h_sent_at IS NULL ✓
├─ Valida (tudo OK)
├─ Verifica: Cliente pagou? NÃO ✓
├─ Envia template rec_cupom_36h
└─ Marca: template_36h_sent_at = NOW()
```

---

## 🚫 Situações que NÃO Enviam Mensagem

### 1. Cliente Pagou um Carrinho
```
Cliente tem 3 carrinhos abandonados
├─ Carrinho A: abandoned
├─ Carrinho B: abandoned
└─ Carrinho C: PAID ← Cliente pagou este!

Resultado: Nenhuma mensagem é enviada para A, B ou C
```

Query utilizada:
```sql
SELECT COUNT(*) FROM checkouts
WHERE status = 'paid'
  AND (customer_email = $1 OR customer_phone_e164 = $2)
```

Se count > 0, não envia para nenhum carrinho desse cliente.

### 2. Há Carrinho Mais Recente
```
Cliente criou novo carrinho antes de recuperar o antigo
├─ Carrinho antigo: created_at = 2026-05-01
└─ Carrinho novo: created_at = 2026-05-03 ← Mais recente!

Resultado: Envia apenas para o novo, ignora o antigo
```

### 3. Template Já Foi Enviado
```
template_1h_sent_at IS NOT NULL
├─ template_1h_sent_at = 2026-05-03T23:00:00Z

Resultado: Pula este template, não envia novamente
```

---

## 📱 Conteúdo dos Templates

### rec_1h
Mensagem inicial após 1 hora:
```
Oi, {{ nome_do_cliente }}! 👋

Percebemos que você deixou alguns itens no carrinho...
Seu carrinho está te esperando: {{ var-1 }}

[Usar cupom QUERO10...]
```

### rec_24h
Mensagem após 24 horas:
```
Oi, {{ nome_do_cliente }}!

Vimos que você iniciou sua compra mas não finalizou...
Verifique seu carrinho: {{ var-1 }}

Está esperando... [link]
```

### rec_cupom_36h
Mensagem com cupom após 36 horas:
```
Oi, {{ nome_do_cliente }}!

Última chance! Use o cupom CUPOM36H...
Finalize agora: {{ var-1 }}
```

---

## 🧪 Testando o Sistema

### Teste Rápido (Simular 36 horas)

1. **Criar checkout abandonado**
   ```bash
   node scripts/simulate-abandoned.js
   ```

2. **Marcar como se tivesse 1h de abandono** (via SQL):
   ```sql
   UPDATE checkouts SET abandoned_at = NOW() - INTERVAL '65 minutes'
   WHERE yever_checkout_id = 'test-abandoned-xxx';
   ```

3. **Forçar job agora**
   ```bash
   curl -X POST https://yever-recovery-bridge-production.up.railway.app/debug/force-recovery-check
   ```

4. **Verificar resultado**
   ```bash
   curl https://yever-recovery-bridge-production.up.railway.app/debug/checkouts | jq '.checkouts[0]'
   ```

   Procure por:
   ```json
   {
     "status": "pending",
     "template_1h_sent_at": "2026-05-03T23:10:00Z",
     "template_24h_sent_at": null,
     "template_36h_sent_at": null
   }
   ```

5. **Simular passagem de tempo para 24h**:
   ```sql
   UPDATE checkouts SET abandoned_at = NOW() - INTERVAL '1440 minutes'
   WHERE yever_checkout_id = 'test-abandoned-xxx';
   ```

6. **Forçar job novamente**
   ```bash
   curl -X POST https://yever-recovery-bridge-production.up.railway.app/debug/force-recovery-check
   ```

   Agora deve ter:
   ```json
   {
     "template_1h_sent_at": "2026-05-03T23:10:00Z",
     "template_24h_sent_at": "2026-05-04T23:10:00Z",
     "template_36h_sent_at": null
   }
   ```

---

## 📊 Logs Esperados

### Sucesso em Cascata
```
[recovery-job] ⏰ Iniciando verificação em 2026-05-03T23:15:00.000Z
[recovery-job] 🔄 Processando template 1h...
[recovery-job] 📦 Encontrados 2 checkouts para template 1h
[recovery-job:1h:checkout-123] ✓ Validação passou
[recovery-job:1h:checkout-123] ✓ Cliente ainda não pagou nada
[recovery-job:1h:checkout-123] ✅ Mensagem com template 1h enviada com sucesso
[recovery-job] ✓ Processamento do template 1h finalizado

[recovery-job] 🔄 Processando template 24h...
[recovery-job] ✓ Nenhum checkout para template 24h
[recovery-job] 🔄 Processando template 36h...
[recovery-job] ✓ Nenhum checkout para template 36h

[recovery-job] ✓ Verificação finalizada
```

### Pulo por Cliente Pagou
```
[recovery-job:24h:checkout-456] ✓ Validação passou
[recovery-job:24h:checkout-456] ⏭️ Cliente já pagou um carrinho, não enviar recuperação
```

---

## 🔄 Próximas Melhorias

- [ ] Suporte a mais templates (7h, 48h, etc)
- [ ] A/B testing de templates
- [ ] Analytics de taxa de conversão
- [ ] Webhook de delivery do WhatsApp
- [ ] Retry automático se Octadesk falhar
- [ ] Suporte a cupons dinâmicos

---

**Status**: ✅ Implementado e pronto para produção
