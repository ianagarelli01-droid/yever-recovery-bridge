# 🔴 CORREÇÃO CRÍTICA: Payload Format para Octadesk

## O Problema Real

Temos **DUAS** falhas que impediam o envio:

1. ❌ **Template ID vazio** — `OCTADESK_TEMPLATE_REC_1H` não estava definido
2. ❌ **Payload no formato errado** — Estrutura completamente diferente do esperado

## Formato Errado (O que tínhamos)

```javascript
{
  phone: "+5511987654321",
  name: "João Silva",
  templateName: "69f77922782bded6aca472a5",
  variables: ["João Silva", "https://seguro.loveandcomfy.com.br/checkout/xyz"],
  singleDest: true,
  origemPhone: "+5511923732847"
}
```

**Resultado**: Octadesk rejeitava porque não reconhecia a estrutura.

## Formato Correto (Documentação Oficial)

```json
{
  "origin": {
    "contact": {
      "channel": "whatsapp",
      "code": "+5511923732847"
    }
  },
  "target": {
    "contact": {
      "channel": "whatsapp",
      "code": "+5511987654321",
      "name": "João Silva"
    }
  },
  "content": {
    "templateMessage": {
      "id": "69f77922782bded6aca472a5",
      "variables": [
        "João Silva",
        "https://seguro.loveandcomfy.com.br/checkout/xyz"
      ]
    }
  },
  "options": {
    "automaticAssign": false
  }
}
```

## Mapeamento de Campos

| Campo Antigo | Campo Novo | Descrição |
|--------------|-----------|-----------|
| `origemPhone` | `origin.contact.code` | Número de origem (WhatsApp oficial) |
| `phone` | `target.contact.code` | Telefone do cliente (E.164) |
| `name` | `target.contact.name` | Nome do cliente |
| `templateName` | `content.templateMessage.id` | ID do template |
| `variables` | `content.templateMessage.variables` | Array de variáveis |
| *(novo)* | `origin.contact.channel` | Canal (sempre "whatsapp") |
| *(novo)* | `target.contact.channel` | Canal (sempre "whatsapp") |
| *(novo)* | `options.automaticAssign` | false (não atribuir a agente) |

## Arquivo Modificado

**Arquivo**: `src/services/octadesk-client.js`

**Mudança**: Função `sendRecoveryTemplate()` (linhas 54-76)

**Antes**:
```javascript
const payload = {
  phone,
  name: customerName,
  templateName: templateId,
  variables: [customerName, checkoutUrl],
  singleDest: true,
  origemPhone: originPhone
};
```

**Depois**:
```javascript
const payload = {
  origin: {
    contact: {
      channel: 'whatsapp',
      code: originPhone
    }
  },
  target: {
    contact: {
      channel: 'whatsapp',
      code: phone,
      name: customerName
    }
  },
  content: {
    templateMessage: {
      id: templateId,
      variables: [customerName, checkoutUrl]
    }
  },
  options: {
    automaticAssign: false
  }
};
```

## Por Que Isso Não Funcionava?

Octadesk espera uma estrutura específica:
- `origin` = Quem está enviando (seu número WhatsApp oficial)
- `target` = Para quem está enviando (cliente)
- `content` = O que está sendo enviado (template com variáveis)
- `options` = Configurações adicionais

Se enviarmos estrutura diferente, a API retorna erro 400 ou 422 (bad request).

## Impacto

✅ Agora o payload será aceito pela API Octadesk
✅ Mensagens WhatsApp serão enviadas corretamente
✅ `octadesk_response` será preenchido com resposta real

## Próximos Passos

1. Commit e push:
```bash
git add src/services/octadesk-client.js
git commit -m "fix: correct Octadesk payload structure according to official documentation"
git push origin main
```

2. Aguardar deploy no Railway (~2 min)

3. Testar:
```bash
# Forçar execução do job
curl -X POST https://yever-recovery-bridge-production.up.railway.app/debug/force-recovery-check

# Ver logs
railway logs --follow

# Verificar resultado
curl https://yever-recovery-bridge-production.up.railway.app/debug/checkouts | jq '.checkouts[0]'
```

4. Procurar por:
```json
{
  "status": "recovered_message_sent",
  "message_sent_at": "2026-05-03T15:45:32.123Z",
  "octadesk_response": {
    "success": true,
    "statusCode": 200,
    "data": { ... }
  }
}
```

---

**Documentação Original**: https://help.octadesk.com/kb/article/como-faco-para-integrar-o-octadesk-com-a-shopify
