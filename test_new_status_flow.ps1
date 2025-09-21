# ========================================================
# RPA Queue 新ステータスフロー テストスクリプト
# ========================================================
# 概要: 新しいステータス遷移をテストするPowerShellスクリプト
# 使用方法: .\test_new_status_flow.ps1 [-FileId 5] [-Reset]
# ========================================================

param(
    [int]$FileId = 5,
    [int]$PatientId = 99999998,
    [switch]$Reset,
    [switch]$ShowStatus,
    [switch]$Help
)

# データベース接続コマンド
$dbCmd = '"C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h localhost -d ageagekun -w'

# ヘルプ表示
if ($Help) {
    Write-Host @"
========================================================
新ステータスフローテストスクリプト
========================================================
使用方法:
    .\test_new_status_flow.ps1 [-FileId <ID>] [-PatientId <ID>] [-Reset] [-ShowStatus]

パラメータ:
    -FileId      : テスト対象のファイルID (デフォルト: 5)
    -PatientId   : 患者ID (デフォルト: 99999998)
    -Reset       : ステータスをpendingにリセット
    -ShowStatus  : 現在のステータスを表示
    -Help        : このヘルプを表示

例:
    # 通常のテスト実行
    .\test_new_status_flow.ps1 -FileId 5

    # ステータスリセット
    .\test_new_status_flow.ps1 -FileId 5 -Reset

    # 現在のステータス確認
    .\test_new_status_flow.ps1 -ShowStatus
========================================================
"@
    exit
}

# 現在のステータスを表示
function Show-CurrentStatus {
    Write-Host "`n==== 現在のステータス分布 ====" -ForegroundColor Cyan
    $query = "SELECT status, COUNT(*) as count FROM rpa_queue GROUP BY status ORDER BY status;"
    Invoke-Expression "$dbCmd -c `"$query`""

    Write-Host "`n==== 最近のキューアイテム ====" -ForegroundColor Cyan
    $query2 = "SELECT id, file_id, patient_id, status, updated_at FROM rpa_queue ORDER BY updated_at DESC LIMIT 5;"
    Invoke-Expression "$dbCmd -c `"$query2`""
}

# ステータス表示のみ
if ($ShowStatus) {
    Show-CurrentStatus
    exit
}

# リセット処理
if ($Reset) {
    Write-Host "`n========================================" -ForegroundColor Yellow
    Write-Host "ステータスをリセットします" -ForegroundColor Yellow
    Write-Host "========================================" -ForegroundColor Yellow

    # まずキューに存在するか確認
    $checkQuery = "SELECT id FROM rpa_queue WHERE file_id = $FileId;"
    $exists = Invoke-Expression "$dbCmd -t -c `"$checkQuery`""

    if ($exists) {
        # 既存のレコードをpendingに更新
        Write-Host "既存のキューアイテムをリセット中..." -ForegroundColor Green
        $updateQuery = "UPDATE rpa_queue SET status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE file_id = $FileId;"
        Invoke-Expression "$dbCmd -c `"$updateQuery`""
    } else {
        # 新規レコードを作成
        Write-Host "新しいキューアイテムを作成中..." -ForegroundColor Green
        $insertQuery = @"
INSERT INTO rpa_queue (file_id, patient_id, status, payload, created_at, updated_at)
VALUES ($FileId, $PatientId, 'pending',
    '{\"file_name\": \"test_file_$FileId.pdf\", \"category\": \"居宅\", \"patient_name\": \"テスト患者\"}'::jsonb,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
"@
        Invoke-Expression "$dbCmd -c `"$insertQuery`""
    }

    # Documentsテーブルもリセット（必要に応じて）
    Write-Host "Documentsテーブルをリセット中..." -ForegroundColor Green
    $docQuery = @"
UPDATE Documents
SET isUploaded = FALSE,
    uploaded_at = NULL,
    pass = REPLACE(pass, '\\uploaded', ''),
    base_dir = REPLACE(base_dir, '\\uploaded', '')
WHERE fileID = $FileId;
"@
    Invoke-Expression "$dbCmd -c `"$docQuery`""

    Write-Host "`n✅ リセット完了" -ForegroundColor Green

    # 最終状態を表示
    $finalQuery = "SELECT id, file_id, status FROM rpa_queue WHERE file_id = $FileId;"
    Invoke-Expression "$dbCmd -c `"$finalQuery`""
    exit
}

# メインテスト処理
Write-Host "`n========================================" -ForegroundColor Green
Write-Host "新ステータスフローテスト開始" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "FileId: $FileId" -ForegroundColor White
Write-Host "PatientId: $PatientId" -ForegroundColor White

# 初期状態確認
Write-Host "`n==== 初期状態 ====" -ForegroundColor Cyan
$initialQuery = "SELECT id, file_id, status FROM rpa_queue WHERE file_id = $FileId;"
Invoke-Expression "$dbCmd -c `"$initialQuery`""

# ステータス遷移テスト
$transitions = @(
    @{From="pending"; To="processing"; Label="1. pending → processing"; Color="Yellow"},
    @{From="processing"; To="uploaded"; Label="2. processing → uploaded (PAD実行)"; Color="Blue"},
    @{From="uploaded"; To="ready_to_print"; Label="3. uploaded → ready_to_print"; Color="Magenta"},
    @{From="ready_to_print"; To="done"; Label="4. ready_to_print → done (印刷完了)"; Color="Green"}
)

foreach ($transition in $transitions) {
    Write-Host "`n$($transition.Label)" -ForegroundColor $transition.Color

    # ステータス更新
    $updateQuery = @"
UPDATE rpa_queue
SET status = '$($transition.To)',
    updated_at = CURRENT_TIMESTAMP
WHERE file_id = $FileId
AND status = '$($transition.From)'
RETURNING id, status;
"@

    $result = Invoke-Expression "$dbCmd -c `"$updateQuery`""

    if ($result -match "UPDATE 0") {
        Write-Host "❌ 更新失敗: 現在のステータスが '$($transition.From)' ではありません" -ForegroundColor Red

        # 現在のステータスを確認
        $currentQuery = "SELECT id, status FROM rpa_queue WHERE file_id = $FileId;"
        Write-Host "現在のステータス:" -ForegroundColor Yellow
        Invoke-Expression "$dbCmd -c `"$currentQuery`""
        break
    } else {
        Write-Host "✅ ステータス更新成功: $($transition.To)" -ForegroundColor Green

        # 関連するトリガーの動作確認（uploaded時）
        if ($transition.To -eq "uploaded") {
            Write-Host "   📄 Documentsテーブル確認中..." -ForegroundColor Gray
            $docQuery = "SELECT fileID, isUploaded, uploaded_at IS NOT NULL as has_timestamp FROM Documents WHERE fileID = $FileId;"
            Invoke-Expression "$dbCmd -c `"$docQuery`""
        }
    }

    # 次の遷移まで少し待機
    Start-Sleep -Seconds 1
}

# 最終結果表示
Write-Host "`n========================================" -ForegroundColor Green
Write-Host "テスト完了 - 最終状態" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green

# 最終的なステータス確認
$finalQuery = @"
SELECT
    q.id as queue_id,
    q.file_id,
    q.patient_id,
    q.status,
    d.isUploaded as doc_uploaded,
    q.updated_at
FROM rpa_queue q
LEFT JOIN Documents d ON q.file_id = d.fileID
WHERE q.file_id = $FileId;
"@

Invoke-Expression "$dbCmd -c `"$finalQuery`""

# 全体のステータス分布も表示
Show-CurrentStatus

Write-Host "`n✅ テスト完了！" -ForegroundColor Green
Write-Host "リセットするには: .\test_new_status_flow.ps1 -FileId $FileId -Reset" -ForegroundColor Gray