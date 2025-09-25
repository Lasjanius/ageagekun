# =====================================
# アゲアゲくん 開発環境バックアップスクリプト
# =====================================
# 実行方法: PowerShellを管理者権限で起動し、.\backup_dev.ps1 を実行
# =====================================

param(
    [string]$BackupPath = ".\",
    [switch]$SkipDatabase = $false,
    [switch]$SkipFiles = $false,
    [switch]$Compress = $false
)

# タイムスタンプ生成
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupDir = Join-Path $BackupPath "backup_$timestamp"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  アゲアゲくん バックアップツール v1.0 " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "バックアップ開始時刻: $(Get-Date -Format 'yyyy/MM/dd HH:mm:ss')" -ForegroundColor White
Write-Host "バックアップ先: $backupDir" -ForegroundColor White
Write-Host ""

# バックアップディレクトリ作成
try {
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
    Write-Host "✅ バックアップディレクトリを作成しました" -ForegroundColor Green
} catch {
    Write-Host "❌ ディレクトリ作成に失敗しました: $_" -ForegroundColor Red
    exit 1
}

# PostgreSQLデータベースバックアップ
if (-not $SkipDatabase) {
    Write-Host ""
    Write-Host "📦 データベースをバックアップ中..." -ForegroundColor Yellow

    $pgDumpPath = "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe"
    $dumpFile = Join-Path $backupDir "ageagekun.dump"

    if (Test-Path $pgDumpPath) {
        try {
            $process = Start-Process -FilePath $pgDumpPath `
                -ArgumentList "-U postgres -h localhost -d ageagekun -F c -b -v -f `"$dumpFile`"" `
                -Wait -PassThru -NoNewWindow

            if ($process.ExitCode -eq 0) {
                $dumpSize = (Get-Item $dumpFile).Length / 1MB
                Write-Host "✅ データベースバックアップ完了 (サイズ: $([Math]::Round($dumpSize, 2)) MB)" -ForegroundColor Green
            } else {
                Write-Host "⚠️ データベースバックアップに問題が発生しました (終了コード: $($process.ExitCode))" -ForegroundColor Yellow
            }
        } catch {
            Write-Host "❌ データベースバックアップ失敗: $_" -ForegroundColor Red
        }
    } else {
        Write-Host "⚠️ pg_dump.exe が見つかりません。PostgreSQLがインストールされているか確認してください。" -ForegroundColor Yellow
    }
}

# ファイルシステムバックアップ
if (-not $SkipFiles) {
    Write-Host ""
    Write-Host "📁 ファイルをバックアップ中..." -ForegroundColor Yellow

    # patientsフォルダ
    $patientsSource = ".\patients"
    if (Test-Path $patientsSource) {
        try {
            Copy-Item -Path $patientsSource -Destination (Join-Path $backupDir "patients") -Recurse -Force
            $fileCount = (Get-ChildItem -Path $patientsSource -Recurse -File).Count
            Write-Host "✅ patientsフォルダをバックアップ ($fileCount ファイル)" -ForegroundColor Green
        } catch {
            Write-Host "❌ patientsフォルダのバックアップ失敗: $_" -ForegroundColor Red
        }
    }

    # batch_printsフォルダ（存在する場合）
    $batchPrintsSource = ".\batch_prints"
    if (Test-Path $batchPrintsSource) {
        try {
            Copy-Item -Path $batchPrintsSource -Destination (Join-Path $backupDir "batch_prints") -Recurse -Force
            Write-Host "✅ batch_printsフォルダをバックアップ" -ForegroundColor Green
        } catch {
            Write-Host "❌ batch_printsフォルダのバックアップ失敗: $_" -ForegroundColor Red
        }
    }
}

# 環境設定ファイルのバックアップ
Write-Host ""
Write-Host "⚙️ 環境設定をバックアップ中..." -ForegroundColor Yellow

# .envファイル
$envFiles = @(
    @{Path=".\backend\.env"; Dest=".env.backend"},
    @{Path=".\.env.local"; Dest=".env.local"},
    @{Path=".\.env"; Dest=".env.root"}
)

foreach ($envFile in $envFiles) {
    if (Test-Path $envFile.Path) {
        try {
            Copy-Item -Path $envFile.Path -Destination (Join-Path $backupDir $envFile.Dest) -Force
            Write-Host "✅ $($envFile.Path) をバックアップ" -ForegroundColor Green
        } catch {
            Write-Host "⚠️ $($envFile.Path) のバックアップ失敗: $_" -ForegroundColor Yellow
        }
    }
}

# pgpass.conf の場所を記録
$pgpassPath = "$env:APPDATA\postgresql\pgpass.conf"
if (Test-Path $pgpassPath) {
    $pgpassContent = Get-Content $pgpassPath | Out-String
    $pgpassInfo = @"
# PostgreSQL パスワード設定
# 場所: $pgpassPath
# 内容:
$pgpassContent
"@
    $pgpassInfo | Out-File -FilePath (Join-Path $backupDir "pgpass_info.txt") -Encoding UTF8
    Write-Host "✅ pgpass.conf の情報を記録" -ForegroundColor Green
}

# バックアップ情報の記録
Write-Host ""
Write-Host "📝 バックアップ情報を記録中..." -ForegroundColor Yellow

$backupInfo = @"
アゲアゲくん バックアップ情報
================================
バックアップ日時: $(Get-Date -Format 'yyyy/MM/dd HH:mm:ss')
マシン名: $env:COMPUTERNAME
ユーザー名: $env:USERNAME
================================

データベース情報:
- PostgreSQL バージョン: 17
- データベース名: ageagekun
- ダンプファイル: ageagekun.dump

ファイルシステム:
- patientsフォルダ: バックアップ済み
- batch_printsフォルダ: $(if (Test-Path $batchPrintsSource) {"バックアップ済み"} else {"未作成"})

環境設定:
- backend/.env: バックアップ済み
- .env.local: $(if (Test-Path ".\.env.local") {"バックアップ済み"} else {"未検出"})
- pgpass.conf: 情報記録済み

リストア手順:
1. PostgreSQL 17をインストール
2. ageagekunデータベースを作成
3. pg_restoreでダンプファイルをリストア
4. patientsフォルダを所定の場所にコピー
5. .envファイルを設定

詳細は README_BACKUP.md を参照
"@

$backupInfo | Out-File -FilePath (Join-Path $backupDir "backup_info.txt") -Encoding UTF8

# 圧縮オプション
if ($Compress) {
    Write-Host ""
    Write-Host "🗜️ バックアップを圧縮中..." -ForegroundColor Yellow

    $zipFile = "$backupDir.zip"
    try {
        Compress-Archive -Path $backupDir -DestinationPath $zipFile -Force
        Write-Host "✅ 圧縮完了: $zipFile" -ForegroundColor Green

        # 元のフォルダを削除するか確認
        $delete = Read-Host "圧縮前のフォルダを削除しますか？ (y/n)"
        if ($delete -eq 'y') {
            Remove-Item -Path $backupDir -Recurse -Force
            Write-Host "✅ 圧縮前のフォルダを削除しました" -ForegroundColor Green
        }
    } catch {
        Write-Host "❌ 圧縮に失敗しました: $_" -ForegroundColor Red
    }
}

# 完了メッセージ
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "✅ バックアップ完了！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "バックアップ場所: $backupDir" -ForegroundColor White
Write-Host "完了時刻: $(Get-Date -Format 'yyyy/MM/dd HH:mm:ss')" -ForegroundColor White
Write-Host ""
Write-Host "このバックアップを運用PCに転送し、リストア手順に従って復元してください。" -ForegroundColor Yellow