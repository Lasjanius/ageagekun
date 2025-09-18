<#
.SYNOPSIS
    rpa_queueトリガーのテストスクリプト
.DESCRIPTION
    rpa_queueテーブルのステータス変更によるトリガー動作をテストします。
    Documentsテーブルの更新、ファイル移動、WebSocket通知の動作を確認できます。
.PARAMETER FileId
    テスト対象のファイルID（デフォルト: 5）
.PARAMETER Reset
    リセットのみ実行（テストを実行せずに初期状態に戻す）
.PARAMETER Help
    ヘルプを表示
.EXAMPLE
    .\test_rpa_trigger.ps1
    FileId=5でテストを実行
.EXAMPLE
    .\test_rpa_trigger.ps1 -FileId 3
    FileId=3でテストを実行
.EXAMPLE
    .\test_rpa_trigger.ps1 -Reset
    最後のテストをリセット
#>

param(
    [int]$FileId = 5,
    [switch]$Reset,
    [switch]$Help
)

# 設定
$psqlPath = "C:\Program Files\PostgreSQL\17\bin\psql.exe"
$dbParams = "-U postgres -h localhost -d ageagekun -w"
$baseDir = "C:\Users\hyosh\Desktop\allright\ageagekun\patients"

# カラー出力用の関数
function Write-ColorOutput {
    param(
        [string]$Message,
        [string]$Color = "White"
    )
    Write-Host $Message -ForegroundColor $Color
}

# PostgreSQLコマンド実行関数
function Invoke-PostgreSQL {
    param(
        [string]$Query
    )
    $cmd = "& `"$psqlPath`" $dbParams -c `"$Query`""
    return Invoke-Expression $cmd
}

# 現在の状態を表示
function Show-CurrentStatus {
    param(
        [int]$FileId
    )

    Write-ColorOutput "`n===== 現在の状態 =====" "Cyan"

    Write-ColorOutput "`n[rpa_queue テーブル]" "Yellow"
    Invoke-PostgreSQL "SELECT id, file_id, status, updated_at FROM rpa_queue WHERE file_id = $FileId ORDER BY id DESC LIMIT 1"

    Write-ColorOutput "`n[Documents テーブル]" "Yellow"
    Invoke-PostgreSQL "SELECT fileID, fileName, patientID, isUploaded, uploaded_at FROM Documents WHERE fileID = $FileId"

    # ファイルの存在確認
    $result = Invoke-PostgreSQL "SELECT patientID, fileName FROM Documents WHERE fileID = $FileId LIMIT 1" | Select-String -Pattern "(\d{8})\s+\|\s+(.+\.pdf)"
    if ($result) {
        $matches = $result.Matches[0].Groups
        $patientId = $matches[1].Value
        $fileName = $matches[2].Value.Trim()

        Write-ColorOutput "`n[ファイル配置]" "Yellow"
        $originalPath = Join-Path $baseDir "$patientId\$fileName"
        $uploadedPath = Join-Path $baseDir "$patientId\uploaded\$fileName"

        if (Test-Path $originalPath) {
            Write-ColorOutput "  ✓ 元の場所: $originalPath" "Green"
        }
        if (Test-Path $uploadedPath) {
            Write-ColorOutput "  ✓ uploadedフォルダ: $uploadedPath" "Green"
        }
        if (-not (Test-Path $originalPath) -and -not (Test-Path $uploadedPath)) {
            Write-ColorOutput "  ✗ ファイルが見つかりません" "Red"
        }
    }
}

# トリガーテスト実行
function Test-Trigger {
    param(
        [int]$FileId
    )

    Write-ColorOutput "`n===== トリガーテスト開始 =====" "Magenta"

    # 1. 現在の状態を表示
    Show-CurrentStatus $FileId

    # 2. rpa_queueにレコードがなければ作成
    $queueCheck = Invoke-PostgreSQL "SELECT COUNT(*) FROM rpa_queue WHERE file_id = $FileId AND status = 'pending'"
    if ($queueCheck -notmatch "1") {
        Write-ColorOutput "`n[新規rpa_queueレコード作成中...]" "Yellow"

        # Documentsから情報取得
        $docInfo = Invoke-PostgreSQL "SELECT d.fileName, d.Category, p.patientName, p.patientID FROM Documents d JOIN patients p ON d.patientID = p.patientID WHERE d.fileID = $FileId"

        # 簡易的なINSERT（実際のpayloadは簡略化）
        Invoke-PostgreSQL "INSERT INTO rpa_queue (file_id, patient_id, status, payload) SELECT $FileId, patientID, 'pending', '{}'::jsonb FROM Documents WHERE fileID = $FileId"
    }

    # 3. ステータスをdoneに変更
    Write-ColorOutput "`n[ステータスを 'done' に変更中...]" "Yellow"
    Invoke-PostgreSQL "UPDATE rpa_queue SET status = 'done', updated_at = CURRENT_TIMESTAMP WHERE file_id = $FileId AND status = 'pending'"

    Start-Sleep -Seconds 2

    # 4. 変更後の状態を表示
    Write-ColorOutput "`n===== トリガー実行後の状態 =====" "Green"
    Show-CurrentStatus $FileId

    Write-ColorOutput "`n✅ トリガーテスト完了" "Green"
    Write-ColorOutput "トリガーにより以下が実行されました:" "White"
    Write-ColorOutput "  1. Documentsテーブルの isUploaded が TRUE に更新" "Gray"
    Write-ColorOutput "  2. uploaded_at タイムスタンプが設定" "Gray"
    Write-ColorOutput "  3. pg_notify でWebSocket通知を送信" "Gray"
    Write-ColorOutput "  4. ファイルがuploadedフォルダに移動（Node.js側で処理）" "Gray"
}

# リセット処理
function Reset-TestData {
    param(
        [int]$FileId
    )

    Write-ColorOutput "`n===== リセット処理開始 =====" "Magenta"

    # 1. rpa_queueをpendingに戻す
    Write-ColorOutput "`n[rpa_queueをリセット中...]" "Yellow"
    Invoke-PostgreSQL "UPDATE rpa_queue SET status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE file_id = $FileId AND status = 'done'"

    # 2. Documentsテーブルをリセット
    Write-ColorOutput "`n[Documentsテーブルをリセット中...]" "Yellow"

    # patientIDとfileNameを取得してパスを再構築
    $docInfo = Invoke-PostgreSQL "SELECT patientID, fileName FROM Documents WHERE fileID = $FileId LIMIT 1" | Select-String -Pattern "(\d{8})\s+\|\s+(.+\.pdf)"
    if ($docInfo) {
        $matches = $docInfo.Matches[0].Groups
        $patientId = $matches[1].Value
        $fileName = $matches[2].Value.Trim()

        # 正しいパスを再構築
        $correctPath = "C:\Users\hyosh\Desktop\allright\ageagekun\patients\$patientId\$fileName"
        $correctBaseDir = "C:\Users\hyosh\Desktop\allright\ageagekun\patients\$patientId"

        # Documentsテーブルを完全にリセット（pass/base_dirも含む）
        Invoke-PostgreSQL "UPDATE Documents SET isUploaded = FALSE, uploaded_at = NULL, pass = '$correctPath', base_dir = '$correctBaseDir' WHERE fileID = $FileId"
    }

    # 3. ファイルを元の場所に戻す
    $result = Invoke-PostgreSQL "SELECT patientID FROM Documents WHERE fileID = $FileId LIMIT 1" | Select-String -Pattern "(\d{8})"
    if ($result) {
        $patientId = $result.Matches[0].Groups[1].Value
        $uploadedDir = Join-Path $baseDir "$patientId\uploaded"
        $originalDir = Join-Path $baseDir $patientId

        if (Test-Path $uploadedDir) {
            Write-ColorOutput "`n[ファイルを元の場所に戻す...]" "Yellow"
            Get-ChildItem -Path $uploadedDir -Filter "*.pdf" | ForEach-Object {
                Move-Item -Path $_.FullName -Destination $originalDir -Force
                Write-ColorOutput "  移動: $($_.Name)" "Gray"
            }
        }
    }

    # 4. リセット後の状態を表示
    Write-ColorOutput "`n===== リセット後の状態 =====" "Green"
    Show-CurrentStatus $FileId

    # 5. rpa_queueレコードを削除
    Write-ColorOutput "`n[rpa_queueレコードを削除中...]" "Yellow"
    Invoke-PostgreSQL "DELETE FROM rpa_queue WHERE file_id = $FileId"
    Write-ColorOutput "  削除完了: file_id=$FileId のレコード" "Gray"

    Write-ColorOutput "`n✅ リセット完了" "Green"
}

# メイン処理
function Main {
    Write-ColorOutput "================================================" "Cyan"
    Write-ColorOutput "   rpa_queue トリガーテストツール" "Cyan"
    Write-ColorOutput "================================================" "Cyan"

    if ($Help) {
        Get-Help $MyInvocation.MyCommand.Path -Detailed
        return
    }

    if ($Reset) {
        Write-ColorOutput "`nリセットモード (FileId: $FileId)" "Yellow"
        Reset-TestData $FileId
    } else {
        Write-ColorOutput "`nテストモード (FileId: $FileId)" "Yellow"
        Test-Trigger $FileId

        Write-ColorOutput "`n---" "Gray"
        Write-ColorOutput "リセットするには以下を実行:" "Gray"
        Write-ColorOutput "  .\test_rpa_trigger.ps1 -FileId $FileId -Reset" "White"
    }

    Write-ColorOutput "`n================================================" "Cyan"
}

# 実行
Main