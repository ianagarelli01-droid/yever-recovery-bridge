# Script para testar a recuperacao no Railway (Windows PowerShell)
# Executa: powershell -ExecutionPolicy Bypass -File test-recovery.ps1

$BASE_URL = "https://yever-recovery-bridge-production.up.railway.app"

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Teste de Recuperacao - Yever Recovery Bridge" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan

Write-Host ""
Write-Host "1. Forcando execucao do job de recuperacao..." -ForegroundColor Yellow

$forceResult = curl.exe -s -X POST "$BASE_URL/debug/force-recovery-check"
Write-Host "Resultado: $forceResult" -ForegroundColor Green

Write-Host ""
Write-Host "Aguardando 3 segundos para processamento..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

Write-Host ""
Write-Host "2. Verificando status dos checkouts..." -ForegroundColor Yellow

try {
    $response = curl.exe -s "$BASE_URL/debug/checkouts"
    $data = $response | ConvertFrom-Json

    if ($data.checkouts -and $data.checkouts.Count -gt 0) {
        $checkout = $data.checkouts[0]

        Write-Host ""
        Write-Host "Resultado do Primeiro Checkout:" -ForegroundColor Cyan
        Write-Host "================================================" -ForegroundColor Cyan
        Write-Host "ID: $($checkout.id)" -ForegroundColor White
        Write-Host "Email: $($checkout.customer_email)" -ForegroundColor White
        Write-Host "Telefone: $($checkout.customer_phone_e164)" -ForegroundColor White
        Write-Host "Nome: $($checkout.customer_name)" -ForegroundColor White
        Write-Host "Status: $($checkout.status)" -ForegroundColor $(if($checkout.status -eq 'recovered_message_sent') { 'Green' } else { 'Yellow' })
        Write-Host "Message Sent At: $($checkout.message_sent_at)" -ForegroundColor $(if($checkout.message_sent_at) { 'Green' } else { 'Red' })

        if ($checkout.octadesk_response) {
            Write-Host "Octadesk Response:" -ForegroundColor Cyan
            Write-Host ($checkout.octadesk_response | ConvertTo-Json -Depth 10) -ForegroundColor Green
        } else {
            Write-Host "Octadesk Response: null (NAO FOI ENVIADA)" -ForegroundColor Red
        }

        Write-Host ""
        Write-Host "================================================" -ForegroundColor Cyan

        # Verificacao de sucesso
        if ($checkout.status -eq 'recovered_message_sent' -and $checkout.message_sent_at) {
            Write-Host "SUCESSO! Mensagem foi enviada!" -ForegroundColor Green
        } elseif ($checkout.status -eq 'pending' -and -not $checkout.message_sent_at) {
            Write-Host "FALHA: Status permanece pending e message_sent_at e null" -ForegroundColor Red
            Write-Host "   Verifique os logs do Railway: railway logs" -ForegroundColor Yellow
        }
    } else {
        Write-Host "Nenhum checkout encontrado no banco" -ForegroundColor Red
    }
} catch {
    Write-Host "Erro ao buscar checkouts: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "3. Para ver os logs do Railway, execute:" -ForegroundColor Cyan
Write-Host "   railway logs" -ForegroundColor White
Write-Host ""
