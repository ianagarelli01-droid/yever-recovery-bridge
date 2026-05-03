# Checklist de Configuração - Yever Recovery Bridge

## Status Atual
✅ Estrutura do projeto criada
✅ Webhooks da Yever implementados
✅ Banco de dados PostgreSQL configurado
✅ Job de recuperação 1h implementado
❌ **Envio de mensagens Octadesk — FALHA IDENTIFICADA**

## Problema Identificado
O sistema estava capturando checkouts abandonados corretamente, mas **não estava enviando mensagens** porque:
- ❌ `OCTADESK_TEMPLATE_REC_1H` estava vazio no `.env`

## Solução Aplicada
1. ✅ Preenchido `OCTADESK_TEMPLATE_REC_1H=69f77922782bded6aca472a5` no `.env` local
2. ✅ Adicionado logging detalhado no `recovery-job.js` para rastrear fluxo de execução
3. ✅ Atualizado `.env.example` com documentação correta

## Próximos Passos

### 1. Fazer Commit das Mudanças
```bash
cd /path/to/yever-recovery-bridge
git add .
git commit -m "fix: add missing Octadesk template ID and enhanced logging"
git push origin main
```

Aguarde o Railway fazer o deploy automático (~1-2 minutos).

### 2. Configurar Variáveis de Ambiente no Railway
Acesse: https://railway.app/project/YOUR_PROJECT_ID/variables

Certifique-se de que **TODAS** as variáveis abaixo estão definidas:

| Variável | Valor | Exemplo |
|----------|-------|---------|
| **DATABASE_URL** | Sua URL do Postgres (gerado automaticamente pelo Railway) | `postgresql://...` |
| **OCTADESK_API_KEY** | Sua chave API | `7317ac33-7f49-4737-9929-2a6d7deb625e.3525ed94-348c-48df-9a19-6ea3a021c89b` |
| **OCTADESK_BASE_URL** | URL base da API | `https://o223219-9a0.api002.octadesk.services` |
| **OCTADESK_ORIGIN_PHONE** | Número oficial de origem | `+5511923732847` |
| **OCTADESK_TEMPLATE_REC_1H** | ID do template (CRÍTICO) | `69f77922782bded6aca472a5` |
| **PORT** | (opcional, padrão 3000) | `3000` |
| **DRY_RUN** | false para enviar de verdade | `false` |
| **JOB_INTERVAL_MINUTES** | Intervalo do job em minutos | `5` |

> **⚠️ CRÍTICO**: Se `OCTADESK_TEMPLATE_REC_1H` estiver vazio ou incorreto no Railway, o job não vai conseguir enviar!

### 3. Testar Novamente

#### 3.1 Ver logs do Railway em tempo real
```bash
railway logs
```
Procure por linhas como:
```
[recovery-job] ⏰ Iniciando verificação
[recovery-job:xxx] ✓ Validação passou
[recovery-job:xxx] Telefone normalizado: ...
[recovery-job:xxx] 📤 Enviando mensagem de recuperação...
```

#### 3.2 Simular novo checkout abandonado
```bash
node scripts/simulate-abandoned.js
```

#### 3.3 Forçar execução do job agora (aguarde ~30 segundos)
```bash
curl -X POST https://yever-recovery-bridge-production.up.railway.app/debug/force-recovery-check
```

#### 3.4 Verificar status dos checkouts
```bash
curl https://yever-recovery-bridge-production.up.railway.app/debug/checkouts | jq
```

**Procure por**:
- ✅ `"message_sent_at": "2026-05-03T..."` (não deve ser null)
- ✅ `"status": "recovered_message_sent"` (deve mudar de pending)
- ✅ `"octadesk_response": { ... }` (não deve ser null)

#### 3.5 Verificar logs do Railway
Os novos logs mostrarão EXATAMENTE onde está travando:
- Se falha na validação: verá `⏭️ Ignorado: ...`
- Se falha no telefone: verá `Telefone inválido`
- Se variável de ambiente falta: verá erro na função `sendRecoveryTemplate`
- Se Octadesk rejeita: verá `Resposta Octadesk: 400/401/500`

## Checkpoints de Debug

Se ainda não funcionar, verifique nesta ordem:

1. **Railway variables não foram sincronizadas**: Faça deploy manual via `railway deploy`
2. **DRY_RUN ativado**: Procure por `DRY RUN` nos logs (não vai enviar)
3. **OCTADESK_TEMPLATE_REC_1H vazio no Railway**: Confira https://railway.app variables
4. **Telefone inválido**: Verifique `customer_phone` no banco (deve ter dígitos)
5. **Erro na Octadesk**: Busque por `Exceção ao chamar sendRecoveryTemplate` nos logs
6. **Checkout mais recente existe**: Pode estar pulando carrinhos

## Arquivo de Credenciais
Suas credenciais Octadesk estão salvas em `credenciais.txt`:
- API Key (hash): `7317ac33-7f49-4737-9929-2a6d7deb625e.3525ed94-348c-48df-9a19-6ea3a021c89b`
- Base URL: `https://o223219-9a0.api002.octadesk.services`
- Número de origem: `+5511923732847`
- Template rec_1h ID: `69f77922782bded6aca472a5` ✅

## Entrega Esperada (Fase 1)
- [x] Estrutura do projeto Node.js
- [x] Endpoints de webhook da Yever
- [x] Modelo de dados para checkouts
- [x] Serviço de normalização de telefone brasileiro
- [x] Serviço de envio de template pela Octadesk
- [x] Job de recuperação 1h com idempotência
- [x] Documentação README
- [ ] **Teste com envio de verdade** (próximo passo)

## Próxima Fase
Uma vez confirmado que as mensagens estão sendo enviadas com sucesso:
1. Verificar se WhatsApp está recebendo as mensagens
2. Se tudo OK, considerar Fase 2: Consultar Shopify antes de enviar (para evitar enviar para clientes que já compraram)
3. Adicionar suporte a mais templates (36h, 24h)
