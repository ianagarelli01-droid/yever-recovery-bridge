# Próximos Passos Imediatos

## ✅ Feito Localmente
- [x] Adicionado `OCTADESK_TEMPLATE_REC_1H=69f77922782bded6aca472a5` no `.env`
- [x] Aprimorado logging no `recovery-job.js` para rastrear fluxo
- [x] Documentação de setup criada

## 🚀 Proxima Ação: Deploy no Railway

### 1. Commit as mudanças locais
```bash
cd "/path/to/yever-recovery-bridge"
git add src/jobs/recovery-job.js .env .env.example SETUP_CHECKLIST.md
git commit -m "feat: fix Octadesk template ID and add detailed logging for recovery job"
git push origin main
```

**O Railway vai fazer deploy automaticamente em 1-2 minutos.**

### 2. Verificar se as variáveis estão no Railway
Acesse: https://railway.app → Seu Projeto → Variables

Procure por:
- `DATABASE_URL` ✅ (deve estar preenchido)
- `OCTADESK_API_KEY` ✅ (deve estar preenchido)
- `OCTADESK_BASE_URL` ✅
- `OCTADESK_ORIGIN_PHONE` ✅
- `OCTADESK_TEMPLATE_REC_1H` ⚠️ **CRÍTICO — precisa estar preenchido!**

Se `OCTADESK_TEMPLATE_REC_1H` estiver vazio no Railway, **adicione**: `69f77922782bded6aca472a5`

### 3. Monitorar os logs após deploy
```bash
railway logs --follow
```

Procure por linhas do recovery-job:
```
[recovery-job] ⏰ Iniciando verificação
[recovery-job:xxx] ✓ Validação passou
[recovery-job:xxx] ✓ Telefone válido
[recovery-job:xxx] 📤 Enviando mensagem de recuperação...
[recovery-job:xxx] ✅ Mensagem enviada com sucesso
```

Se vir mensagens de erro sobre variáveis:
```
[octadesk] Missing required environment variables
```

Significa que `OCTADESK_TEMPLATE_REC_1H` está vazio no Railway.

### 4. Testar após deploy
Aguarde 2 minutos e execute:

```bash
# Forçar job agora
curl -X POST https://yever-recovery-bridge-production.up.railway.app/debug/force-recovery-check

# Verificar status dos checkouts
curl https://yever-recovery-bridge-production.up.railway.app/debug/checkouts | jq '.checkouts[0] | {id, customer_email, status, message_sent_at, octadesk_response}'
```

Procure por:
```json
{
  "id": 1,
  "customer_email": "...",
  "status": "recovered_message_sent",
  "message_sent_at": "2026-05-03T15:30:45.123Z",
  "octadesk_response": { ... }
}
```

Se ainda tiver `message_sent_at: null`, verifique os logs do Railway para o erro exato.

---

## 📋 Resumo do Problema e Solução

**Problema**: Checkouts abandonados não estavam recebendo mensagens WhatsApp
- Sistema capturava webhooks ✅
- Armazenava no banco ✅
- Job executava a cada 5 min ✅
- Mas **nenhuma mensagem era enviada** ❌

**Causa Raiz**: `OCTADESK_TEMPLATE_REC_1H` estava vazio
- Recovery-job.js chamava `sendRecoveryTemplate()`
- Função validava `OCTADESK_TEMPLATE_REC_1H` (linha 28 de octadesk-client.js)
- Lançava erro `Missing required environment variables`
- Erro não era capturado/logado, apenas silenciosamente falhava

**Solução Aplicada**:
1. ✅ Preenchido template ID no `.env` local
2. ✅ Adicionado logging detalhado no recovery-job para rastrear fluxo
3. ✅ Documentação de setup criada

**Resultado Esperado**: Próximo teste deve mostrar mensagens sendo enviadas para Octadesk
