# 📊 Rastreamento com UTM Parameters

## O Que São UTM Parameters?

UTM (Urchin Tracking Module) são parâmetros adicionados à URL que rastreiam a origem do tráfego no Google Analytics.

---

## Como Funciona no Sistema

### URL Original
```
https://seguro.loveandcomfy.com.br/checkout/products?product_id[0]=xxx&quantity[0]=1&cart=abc123
```

### URL com UTM (após sistema Yever Recovery Bridge)
```
https://seguro.loveandcomfy.com.br/checkout/products?product_id[0]=xxx&quantity[0]=1&cart=abc123
  &utm_source=whatsapp
  &utm_medium=octadesk
  &utm_campaign=cart_recovery_1h
  &utm_content=rec_1h
```

---

## Parâmetros Utilizados

| Parâmetro | Valor | Significado |
|-----------|-------|-------------|
| `utm_source` | `whatsapp` | Canal de origem (WhatsApp) |
| `utm_medium` | `octadesk` | Tipo de mídia (API Octadesk) |
| `utm_campaign` | `cart_recovery_1h` | Campanha (recuperação em 1h, 24h ou 36h) |
| `utm_content` | `rec_1h` | Conteúdo específico (qual template foi enviado) |

---

## Valores por Template

### Template 1h
```
utm_campaign=cart_recovery_1h
utm_content=rec_1h
```

### Template 24h
```
utm_campaign=cart_recovery_24h
utm_content=rec_24h
```

### Template 36h
```
utm_campaign=cart_recovery_36h
utm_content=rec_36h
```

---

## No Google Analytics

Após configurar Google Analytics no seu site, você verá:

### Acquisition → Campaigns → All Campaigns
```
cart_recovery_1h   → X visitas
cart_recovery_24h  → Y visitas
cart_recovery_36h  → Z visitas
```

### Behavior → Landing Pages
```
/checkout/products?cart=... (utm_campaign=cart_recovery_1h)
```

### Audience Flow
```
Whatsapp (utm_source)
  → Octadesk (utm_medium)
    → Cart Recovery (utm_campaign)
      → rec_1h / rec_24h / rec_36h (utm_content)
```

---

## Configurar Google Analytics

### 1. Se ainda não tem Google Analytics
Adicione este código no `<head>` do seu site:
```html
<!-- Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'GA_MEASUREMENT_ID');
</script>
```

Substitua `GA_MEASUREMENT_ID` pelo seu ID (começa com `G-`)

### 2. Google Analytics automaticamente rastreará UTM

Os parâmetros na URL serão automaticamente capturados!

---

## Exemplo de Relatório

**Campanha**: cart_recovery_1h
- **Sessões**: 150
- **Taxa de conversão**: 32%
- **Valor médio do pedido**: R$ 287,50
- **Receita total**: R$ 13.687,50

**Campanha**: cart_recovery_24h
- **Sessões**: 89
- **Taxa de conversão**: 18%
- **Valor médio do pedido**: R$ 245,00
- **Receita total**: R$ 3.924,00

**Campanha**: cart_recovery_36h
- **Sessões**: 42
- **Taxa de conversão**: 12%
- **Valor médio do pedido**: R$ 220,00
- **Receita total**: R$ 1.103,20

---

## ROI da Recuperação

```
Exemplo:
Receita total recuperada: R$ 18.714,70
Custo do Octadesk: ~R$ 100/mês
ROI: 187x (18.714 / 100)

Conversão média: 21% dos clientes que recebem a mensagem
Tempo médio para converter: 2-4 horas após receber a mensagem
```

---

## Dicas de Análise

1. **Compare os 3 templates**
   - Qual tem melhor taxa de conversão?
   - Qual recupera mais valor?

2. **Identifique o pico de conversão**
   - Template 1h tem mais conversões? Aumente a frequência
   - Template 36h não converte? Retire ou mude o conteúdo

3. **Teste diferentes cupons**
   - Template 1h: sem cupom (urgência)
   - Template 24h: cupom 10%
   - Template 36h: cupom 15% + frete grátis

4. **Segmente por:
   - Valor do carrinho
   - Primeira compra vs. cliente recorrente
   - Tipo de produto

---

## Implementação

✅ UTM adicionado automaticamente pelo sistema  
✅ Não precisa fazer nada na loja  
✅ Google Analytics já rastreia automaticamente  

Basta configurar GA no seu site e começar a usar o sistema! 🚀

---

**Status**: ✅ Pronto para produção
