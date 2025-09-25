# =====================================
# アゲアゲくん 運用環境テストスクリプト
# =====================================
# 実行方法: PowerShellで .\test_production.ps1 を実行
# =====================================

param(
    [string]$ServerIP = "localhost",
    [int]$Port = 3000,
    [switch]$FullTest = $false
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  アゲアゲくん 動作確認テスト v1.0    " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "テスト対象サーバー: ${ServerIP}:${Port}" -ForegroundColor White
Write-Host "テスト開始: $(Get-Date -Format 'yyyy/MM/dd HH:mm:ss')" -ForegroundColor White
Write-Host ""

$testResults = @()
$failCount = 0

# テスト関数
function Test-Component {
    param(
        [string]$Name,
        [string]$Description,
        [scriptblock]$TestScript
    )

    Write-Host -NoNewline "🔍 $Description ... " -ForegroundColor Yellow

    try {
        $result = & $TestScript
        if ($result) {
            Write-Host "✅ OK" -ForegroundColor Green
            $script:testResults += @{Name=$Name; Status="OK"; Message=$Description}
            return $true
        } else {
            Write-Host "❌ FAILED" -ForegroundColor Red
            $script:testResults += @{Name=$Name; Status="FAILED"; Message=$Description}
            $script:failCount++
            return $false
        }
    } catch {
        Write-Host "❌ ERROR: $_" -ForegroundColor Red
        $script:testResults += @{Name=$Name; Status="ERROR"; Message=$_}
        $script:failCount++
        return $false
    }
}

Write-Host "====== 1. PostgreSQL接続テスト ======" -ForegroundColor Cyan
Write-Host ""

# PostgreSQL接続テスト
Test-Component -Name "PostgreSQL" -Description "PostgreSQL サービスの確認" -TestScript {
    $service = Get-Service -Name "postgresql-x64-17" -ErrorAction SilentlyContinue
    return $service.Status -eq "Running"
}

Test-Component -Name "Database" -Description "ageagekunデータベースへの接続" -TestScript {
    $psqlPath = "C:\Program Files\PostgreSQL\17\bin\psql.exe"
    if (Test-Path $psqlPath) {
        $output = & $psqlPath -U postgres -h $ServerIP -d ageagekun -w -t -c "SELECT 1" 2>&1
        return $output -match "1"
    }
    return $false
}

Test-Component -Name "Tables" -Description "必要なテーブルの存在確認" -TestScript {
    $psqlPath = "C:\Program Files\PostgreSQL\17\bin\psql.exe"
    $tables = & $psqlPath -U postgres -h $ServerIP -d ageagekun -w -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public'" 2>&1
    return [int]$tables -gt 0
}

Write-Host ""
Write-Host "====== 2. Node.jsサーバーテスト ======" -ForegroundColor Cyan
Write-Host ""

# HTTPサーバー接続テスト
Test-Component -Name "HTTP" -Description "HTTPサーバーへの接続" -TestScript {
    try {
        $response = Invoke-WebRequest -Uri "http://${ServerIP}:${Port}/api/health" -Method GET -UseBasicParsing -TimeoutSec 5
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

# API応答テスト
Test-Component -Name "API" -Description "Health APIの応答確認" -TestScript {
    try {
        $response = Invoke-RestMethod -Uri "http://${ServerIP}:${Port}/api/health" -Method GET -TimeoutSec 5
        return $response.status -eq "OK"
    } catch {
        return $false
    }
}

# WebSocket接続テスト（オプション）
if ($FullTest) {
    Write-Host ""
    Write-Host "====== 3. データ取得テスト ======" -ForegroundColor Cyan
    Write-Host ""

    Test-Component -Name "Patients" -Description "患者データの取得" -TestScript {
        try {
            $response = Invoke-RestMethod -Uri "http://${ServerIP}:${Port}/api/patients/all" -Method GET -TimeoutSec 10
            return $response -is [array]
        } catch {
            return $false
        }
    }

    Test-Component -Name "Documents" -Description "ドキュメントリストの取得" -TestScript {
        try {
            $response = Invoke-RestMethod -Uri "http://${ServerIP}:${Port}/api/documents/all" -Method GET -TimeoutSec 10
            return $response -is [array]
        } catch {
            return $false
        }
    }
}

Write-Host ""
Write-Host "====== 4. ファイルシステムテスト ======" -ForegroundColor Cyan
Write-Host ""

# ファイルシステム確認
Test-Component -Name "Patients Dir" -Description "patientsフォルダの存在確認" -TestScript {
    $path = if ($ServerIP -eq "localhost") {
        ".\patients"
    } else {
        # リモートの場合はスキップ
        return $true
    }
    Test-Path $path
}

# ネットワーク接続テスト（別PC用）
if ($ServerIP -ne "localhost" -and $ServerIP -ne "127.0.0.1") {
    Write-Host ""
    Write-Host "====== 5. ネットワークテスト ======" -ForegroundColor Cyan
    Write-Host ""

    Test-Component -Name "Ping" -Description "サーバーへのPing確認" -TestScript {
        $ping = Test-Connection -ComputerName $ServerIP -Count 2 -Quiet
        return $ping
    }

    Test-Component -Name "Port 3000" -Description "ポート3000の開放確認" -TestScript {
        $connection = Test-NetConnection -ComputerName $ServerIP -Port $Port -WarningAction SilentlyContinue
        return $connection.TcpTestSucceeded
    }

    Test-Component -Name "Port 5432" -Description "PostgreSQLポート5432の確認" -TestScript {
        $connection = Test-NetConnection -ComputerName $ServerIP -Port 5432 -WarningAction SilentlyContinue
        return $connection.TcpTestSucceeded
    }
}

# テスト結果サマリー
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "         テスト結果サマリー            " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$totalTests = $testResults.Count
$passedTests = ($testResults | Where-Object {$_.Status -eq "OK"}).Count

Write-Host "合計テスト数: $totalTests" -ForegroundColor White
Write-Host "成功: $passedTests" -ForegroundColor Green
Write-Host "失敗: $failCount" -ForegroundColor $(if ($failCount -gt 0) {"Red"} else {"Gray"})
Write-Host ""

# 詳細結果表示
if ($failCount -gt 0) {
    Write-Host "失敗したテスト:" -ForegroundColor Red
    $testResults | Where-Object {$_.Status -ne "OK"} | ForEach-Object {
        Write-Host "  ❌ $($_.Name): $($_.Message)" -ForegroundColor Red
    }
    Write-Host ""
}

# 最終判定
if ($failCount -eq 0) {
    Write-Host "✅ すべてのテストが成功しました！" -ForegroundColor Green
    Write-Host "システムは正常に動作しています。" -ForegroundColor Green
} else {
    Write-Host "⚠️ 一部のテストが失敗しました。" -ForegroundColor Yellow
    Write-Host "上記の失敗項目を確認してください。" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "テスト完了: $(Get-Date -Format 'yyyy/MM/dd HH:mm:ss')" -ForegroundColor White

# ブラウザで開くかの確認
if ($failCount -eq 0 -and $ServerIP -eq "localhost") {
    Write-Host ""
    $openBrowser = Read-Host "ブラウザでアプリケーションを開きますか？ (y/n)"
    if ($openBrowser -eq 'y') {
        Start-Process "http://localhost:$Port"
    }
}