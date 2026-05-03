# 🧪 Guia de Teste no Windows

Como testar o sistema no Railway desde o Windows.

## Opção 1: Script PowerShell (Recomendado)

```powershell
powershell -ExecutionPolicy Bypass -File test-recovery.ps1
```

Resultado bonito e formatado! ✨

## Opção 2: Script Batch (CMD)

```cmd
test-recovery.bat
```

Salva resultado em `checkouts.json` para você abrir.

## Opção 3: Comandos Manuais

### 1. Forçar execução do job
```cmd
curl -X POST https://yever-recovery-bridge-production.up.railway.app/debug/force-recovery-check
```

### 2. Ver logs do Railway
```cmd
railway logs
```
(Não use `--follow`, use setas/Page Down para scroll)

Ou para ver últimas linhas:
```cmd
railway logs | tail -50
```

### 3. Ver checkouts
```cmd
curl https://yever-recovery-bridge-production.up.railway.app/debug/checkouts > checkouts.json
```

Depois abra `checkouts.json` em qualquer editor de texto.

## O Que Procurar no Resultado

```json
{
  "id": 1,
  "customer_email": "...",
  "status": "recovered_message_sent",      ← Deve estar assim
  "message_sent_at": "2026-05-03T15:...",  ← Não deve ser null
  "octadesk_response": {                    ← Deve ter resposta
    "success": true,
    "statusCode": 200,
    "data": {...}
  }
}
```

## ✅ Sucesso
- `status` = `recovered_message_sent`
- `message_sent_at` = data/hora (não null)
- `octadesk_response.success` = true

## ❌ Falha
- `status` = `pending`
- `message_sent_at` = null
- `octadesk_response` = null ou error

Se falhar, verifique os logs: `railway logs`

Procure por:
- `[octadesk] Missing required environment variables` → Variável faltando no Railway
- `Erro ao enviar` → Problema na API Octadesk
- `Exceção ao chamar sendRecoveryTemplate` → Erro no código

---

**Dica**: Se o resultado continuar mostrando `message_sent_at: null`, é porque:
1. As variáveis Octadesk não foram adicionadas no Railway
2. O payload ainda está no formato errado (improvável agora)
3. Há erro na resposta Octadesk (verifique logs)
