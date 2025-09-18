# ============================================
# ケアマネージャー管理システム テストスクリプト
# ============================================

param(
    [Parameter()]
    [ValidateSet("Setup", "Migrate", "Normalize", "Test", "Reset", "Help")]
    [string]$Mode = "Help",

    [Parameter()]
    [switch]$SkipConfirmation
)

# データベース接続設定
$psqlPath = "C:\Program Files\PostgreSQL\17\bin\psql.exe"
$dbHost = "localhost"
$dbName = "ageagekun"
$dbUser = "postgres"

# SQLファイルのパス
$schemaPath = "C:\Users\hyosh\Desktop\allright\ageagekun\schema"
$schemaFile = "$schemaPath\care_management_schema.sql"
$migrationFile = "$schemaPath\care_management_migration.sql"
$normalizationFile = "$schemaPath\care_normalization.sql"
$testDataFile = "$schemaPath\care_management_test_data.sql"

# 色付き出力用の関数
function Write-ColorOutput($ForegroundColor, $Text) {
    $previousColor = $host.UI.RawUI.ForegroundColor
    $host.UI.RawUI.ForegroundColor = $ForegroundColor
    Write-Output $Text
    $host.UI.RawUI.ForegroundColor = $previousColor
}

# psqlコマンド実行関数
function Execute-SQL {
    param(
        [string]$SqlCommand = "",
        [string]$SqlFile = ""
    )

    if ($SqlFile) {
        & $psqlPath -U $dbUser -h $dbHost -d $dbName -w -f $SqlFile
    } else {
        & $psqlPath -U $dbUser -h $dbHost -d $dbName -w -c $SqlCommand
    }
}

# ヘルプ表示
function Show-Help {
    Write-ColorOutput Yellow @"
==================================================
ケアマネージャー管理システム セットアップツール
==================================================

使用方法:
  .\test_care_management.ps1 -Mode <モード> [-SkipConfirmation]

モード:
  Setup     : 新規テーブルとビューを作成
  Migrate   : 既存データをcm_idに移行してCMNameカラムを削除
  Normalize : 完全正規化（visitingNurse, homecareOffice, CMNameカラムを削除）
  Test      : テストデータを投入して動作確認
  Reset     : テーブルを削除（危険！）
  Help      : このヘルプを表示

例:
  # 初回セットアップ（テーブル作成）
  .\test_care_management.ps1 -Mode Setup

  # 既存データの移行
  .\test_care_management.ps1 -Mode Migrate

  # 完全正規化の実行
  .\test_care_management.ps1 -Mode Normalize

  # テストデータで動作確認
  .\test_care_management.ps1 -Mode Test

  # すべてリセット（注意！）
  .\test_care_management.ps1 -Mode Reset -SkipConfirmation

"@
}

# セットアップ処理
function Setup-Tables {
    Write-ColorOutput Cyan "`n📦 テーブルとビューを作成しています..."

    if (-not (Test-Path $schemaFile)) {
        Write-ColorOutput Red "エラー: スキーマファイルが見つかりません: $schemaFile"
        return
    }

    Execute-SQL -SqlFile $schemaFile

    Write-ColorOutput Green "✅ テーブル作成完了"

    # 作成されたテーブルの確認
    Write-ColorOutput Cyan "`n📊 作成されたテーブル:"
    Execute-SQL -SqlCommand @"
SELECT table_name, table_type
FROM information_schema.tables
WHERE table_schema = 'public'
AND (table_name IN ('care_offices', 'care_managers')
     OR table_name LIKE '%_view')
ORDER BY table_type, table_name;
"@
}

# データ移行処理
function Migrate-Data {
    Write-ColorOutput Cyan "`n🔄 既存データを移行しています..."

    # 現在のCMName使用状況を確認
    Write-ColorOutput Yellow "現在のCMNameデータ:"
    Execute-SQL -SqlCommand @"
SELECT COUNT(DISTINCT CMName) as unique_cms,
       COUNT(*) as total_patients_with_cm
FROM patients
WHERE CMName IS NOT NULL AND CMName != '';
"@

    if (-not $SkipConfirmation) {
        Write-ColorOutput Yellow "`n⚠️  警告: この操作は以下を実行します:"
        Write-ColorOutput Yellow "  1. CMNameから一意なケアマネージャーを抽出"
        Write-ColorOutput Yellow "  2. care_managersテーブルに登録"
        Write-ColorOutput Yellow "  3. patientsテーブルのcm_idを更新"
        Write-ColorOutput Yellow "  4. CMNameカラムを削除"

        $confirm = Read-Host "`n続行しますか？ (y/n)"
        if ($confirm -ne 'y') {
            Write-ColorOutput Red "処理を中止しました"
            return
        }
    }

    if (-not (Test-Path $migrationFile)) {
        Write-ColorOutput Red "エラー: 移行ファイルが見つかりません: $migrationFile"
        return
    }

    Execute-SQL -SqlFile $migrationFile

    Write-ColorOutput Green "✅ データ移行完了"

    # 移行結果の確認
    Write-ColorOutput Cyan "`n📊 移行結果:"
    Execute-SQL -SqlCommand @"
SELECT
    'Care Offices' as entity,
    COUNT(*) as count
FROM care_offices
UNION ALL
SELECT
    'Care Managers' as entity,
    COUNT(*) as count
FROM care_managers
UNION ALL
SELECT
    'Patients with CM' as entity,
    COUNT(*) as count
FROM patients WHERE cm_id IS NOT NULL;
"@
}

# 完全正規化処理
function Normalize-Database {
    Write-ColorOutput Cyan "`n🔧 データベースを完全正規化しています..."

    # 現在のカラム状況を確認
    Write-ColorOutput Yellow "現在のカラム状況:"
    Execute-SQL -SqlCommand @"
SELECT
    COUNT(DISTINCT visitingNurse) as unique_vns,
    COUNT(DISTINCT homecareOffice) as unique_offices,
    COUNT(DISTINCT CMName) as unique_cms
FROM patients
WHERE visitingNurse IS NOT NULL
   OR homecareOffice IS NOT NULL
   OR CMName IS NOT NULL;
"@

    if (-not $SkipConfirmation) {
        Write-ColorOutput Yellow "`n⚠️  警告: この操作は以下を実行します:"
        Write-ColorOutput Yellow "  1. visitingNurseをvisiting_nurse_stationsテーブルに移行"
        Write-ColorOutput Yellow "  2. visitingNurse, homecareOffice, CMNameカラムを削除"
        Write-ColorOutput Yellow "  3. データを完全に正規化"
        Write-ColorOutput Red "  ※ バックアップテーブルが作成されます"

        $confirm = Read-Host "`n続行しますか？ (y/n)"
        if ($confirm -ne 'y') {
            Write-ColorOutput Red "処理を中止しました"
            return
        }
    }

    if (-not (Test-Path $normalizationFile)) {
        Write-ColorOutput Red "エラー: 正規化ファイルが見つかりません: $normalizationFile"
        return
    }

    Execute-SQL -SqlFile $normalizationFile

    Write-ColorOutput Green "✅ 完全正規化完了"

    # 正規化結果の確認
    Write-ColorOutput Cyan "`n📊 正規化後のテーブル構造:"
    Execute-SQL -SqlCommand @"
SELECT
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name = 'patients'
ORDER BY ordinal_position;
"@

    Write-ColorOutput Cyan "`n📊 正規化統計:"
    Execute-SQL -SqlCommand @"
SELECT
    'Patients with CM' as relation,
    COUNT(*) as count
FROM patients WHERE cm_id IS NOT NULL
UNION ALL
SELECT
    'Patients with VNS' as relation,
    COUNT(*) as count
FROM patients WHERE vns_id IS NOT NULL
UNION ALL
SELECT
    'VN Stations' as relation,
    COUNT(*) as count
FROM visiting_nurse_stations;
"@
}

# テストデータ投入
function Test-System {
    Write-ColorOutput Cyan "`n🧪 テストデータを投入しています..."

    if (-not (Test-Path $testDataFile)) {
        Write-ColorOutput Red "エラー: テストデータファイルが見つかりません: $testDataFile"
        return
    }

    Execute-SQL -SqlFile $testDataFile

    Write-ColorOutput Green "✅ テストデータ投入完了"

    # テスト結果の表示
    Write-ColorOutput Cyan "`n📊 ケアマネージャー別担当患者数:"
    Execute-SQL -SqlCommand "SELECT * FROM cm_workload_view;"

    Write-ColorOutput Cyan "`n🏢 事業所別統計:"
    Execute-SQL -SqlCommand "SELECT * FROM office_statistics_view;"

    Write-ColorOutput Cyan "`n👥 患者情報（サンプル5件）:"
    Execute-SQL -SqlCommand @"
SELECT
    patientName,
    cm_name,
    office_name
FROM patient_full_view
LIMIT 5;
"@
}

# リセット処理
function Reset-System {
    Write-ColorOutput Red "`n⚠️  警告: すべてのテーブルとデータが削除されます！"

    if (-not $SkipConfirmation) {
        $confirm = Read-Host "本当に削除しますか？ 'DELETE' と入力してください"
        if ($confirm -ne 'DELETE') {
            Write-ColorOutput Yellow "処理を中止しました"
            return
        }
    }

    Write-ColorOutput Cyan "🗑️ システムをリセットしています..."

    Execute-SQL -SqlCommand @"
DROP VIEW IF EXISTS patient_full_view CASCADE;
DROP VIEW IF EXISTS cm_workload_view CASCADE;
DROP VIEW IF EXISTS office_statistics_view CASCADE;
DROP TRIGGER IF EXISTS patient_cmname_to_cmid_trigger ON patients CASCADE;
DROP TRIGGER IF EXISTS update_care_offices_updated_at ON care_offices CASCADE;
DROP TRIGGER IF EXISTS update_care_managers_updated_at ON care_managers CASCADE;
DROP FUNCTION IF EXISTS sync_cmname_to_cmid() CASCADE;
DROP FUNCTION IF EXISTS update_updated_at() CASCADE;
ALTER TABLE patients DROP COLUMN IF EXISTS cm_id;
DROP TABLE IF EXISTS care_managers CASCADE;
DROP TABLE IF EXISTS care_offices CASCADE;
"@

    Write-ColorOutput Green "✅ リセット完了"
}

# システム状態確認
function Check-Status {
    Write-ColorOutput Cyan "`n📊 現在のシステム状態:"

    Execute-SQL -SqlCommand @"
SELECT
    CASE
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'care_offices')
        THEN '✅ 作成済み'
        ELSE '❌ 未作成'
    END as care_offices_table,
    CASE
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'care_managers')
        THEN '✅ 作成済み'
        ELSE '❌ 未作成'
    END as care_managers_table,
    CASE
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'visiting_nurse_stations')
        THEN '✅ 作成済み'
        ELSE '❌ 未作成'
    END as vns_table;
"@

    Write-ColorOutput Cyan "`n📊 患者テーブルのカラム状態:"
    Execute-SQL -SqlCommand @"
SELECT
    CASE
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'patients' AND column_name = 'cm_id')
        THEN '✅ 正規化済み'
        ELSE '❌ 未追加'
    END as cm_id_column,
    CASE
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'patients' AND column_name = 'vns_id')
        THEN '✅ 正規化済み'
        ELSE '❌ 未追加'
    END as vns_id_column,
    CASE
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'patients' AND column_name = 'cmname')
        THEN '⚠️ 要削除'
        ELSE '✅ 削除済み'
    END as cmname_column,
    CASE
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'patients' AND column_name = 'homecareoffice')
        THEN '⚠️ 要削除'
        ELSE '✅ 削除済み'
    END as homecare_column,
    CASE
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'patients' AND column_name = 'visitingnurse')
        THEN '⚠️ 要削除'
        ELSE '✅ 削除済み'
    END as visitingnurse_column;
"@
}

# メイン処理
Write-ColorOutput Cyan @"
============================================
ケアマネージャー管理システム テストツール
============================================
"@

Check-Status

switch ($Mode) {
    "Setup" {
        Setup-Tables
    }
    "Migrate" {
        Migrate-Data
    }
    "Normalize" {
        Normalize-Database
    }
    "Test" {
        Test-System
    }
    "Reset" {
        Reset-System
    }
    default {
        Show-Help
    }
}

Write-ColorOutput Cyan "`n処理が完了しました`n"