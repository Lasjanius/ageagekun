-- ============================================
-- データベース完全正規化移行スクリプト
-- ============================================
-- このスクリプトは以下を実行します：
-- 1. visitingNurse → visiting_nurse_stationsテーブルへ移行
-- 2. homecareOfficeカラムの削除
-- 3. CMNameカラムの削除（すでにcm_idへ移行済み）
-- 4. visitingNurseカラムの削除

BEGIN;

-- ============================================
-- STEP 1: 現在のデータ状況確認
-- ============================================
SELECT
    'Current Data Status' AS info,
    COUNT(DISTINCT visitingNurse) AS unique_vns,
    COUNT(DISTINCT homecareOffice) AS unique_offices,
    COUNT(DISTINCT CMName) AS unique_cms,
    COUNT(*) AS total_patients
FROM patients
WHERE visitingNurse IS NOT NULL
   OR homecareOffice IS NOT NULL
   OR CMName IS NOT NULL;

-- ============================================
-- STEP 2: visiting_nurse_stationsテーブルへデータ投入
-- ============================================
-- visitingNurseから一意な訪問看護ステーションを抽出
INSERT INTO visiting_nurse_stations (name, address, tel)
SELECT DISTINCT
    visitingNurse AS name,
    '住所は後で更新してください' AS address,
    NULL AS tel
FROM patients
WHERE visitingNurse IS NOT NULL AND visitingNurse != ''
  AND NOT EXISTS (
      SELECT 1 FROM visiting_nurse_stations vns
      WHERE vns.name = patients.visitingNurse
  );

-- デフォルト訪問看護ステーションを追加（未設定用）
INSERT INTO visiting_nurse_stations (name, address)
SELECT '未設定', '住所未設定'
WHERE NOT EXISTS (
    SELECT 1 FROM visiting_nurse_stations WHERE name = '未設定'
);

-- ============================================
-- STEP 3: patientsテーブルのvns_id更新
-- ============================================
-- visitingNurseを基にvns_idを設定
UPDATE patients p
SET vns_id = vns.vns_id
FROM visiting_nurse_stations vns
WHERE p.visitingNurse = vns.name
  AND p.vns_id IS NULL;

-- 更新結果の確認
SELECT
    COUNT(*) AS total_patients,
    COUNT(vns_id) AS patients_with_vns_id,
    COUNT(visitingNurse) AS patients_with_visitingnurse,
    COUNT(*) - COUNT(vns_id) AS patients_without_vns_id
FROM patients;

-- ============================================
-- STEP 4: データ整合性の最終確認
-- ============================================
-- 移行前の最終チェック
DO $$
DECLARE
    unmapped_vns INTEGER;
    unmapped_cm INTEGER;
    has_homecare INTEGER;
BEGIN
    -- vns_idが設定されていないがvisitingNurseがある患者の数
    SELECT COUNT(*) INTO unmapped_vns
    FROM patients
    WHERE visitingNurse IS NOT NULL AND visitingNurse != ''
      AND vns_id IS NULL;

    -- cm_idが設定されていないがCMNameがある患者の数
    SELECT COUNT(*) INTO unmapped_cm
    FROM patients
    WHERE CMName IS NOT NULL AND CMName != ''
      AND cm_id IS NULL;

    -- homecareOfficeがまだ設定されている患者の数
    SELECT COUNT(*) INTO has_homecare
    FROM patients
    WHERE homecareOffice IS NOT NULL AND homecareOffice != '';

    IF unmapped_vns > 0 THEN
        RAISE NOTICE '警告: % 名の患者でvisitingNurseは設定されていますがvns_idが未設定です', unmapped_vns;
    END IF;

    IF unmapped_cm > 0 THEN
        RAISE NOTICE '警告: % 名の患者でCMNameは設定されていますがcm_idが未設定です', unmapped_cm;
    END IF;

    IF has_homecare > 0 THEN
        RAISE NOTICE '注意: % 名の患者でhomecareOfficeが設定されています（care_officesテーブルで管理）', has_homecare;
    END IF;

    -- 全てのデータが移行されている場合
    IF unmapped_vns = 0 AND unmapped_cm = 0 THEN
        RAISE NOTICE '✓ データ移行の準備が整いました';
    ELSE
        RAISE EXCEPTION 'データ移行が不完全です。上記の警告を確認してください。';
    END IF;
END $$;

-- ============================================
-- STEP 5: 不要なカラムの削除
-- ============================================
-- 旧カラムの削除前にバックアップテーブル作成（安全のため）
CREATE TABLE IF NOT EXISTS patients_backup_before_normalization AS
SELECT * FROM patients;

-- visitingNurseカラムの削除
ALTER TABLE patients DROP COLUMN IF EXISTS visitingNurse;

-- homecareOfficeカラムの削除
ALTER TABLE patients DROP COLUMN IF EXISTS homecareOffice;

-- CMNameカラムの削除
ALTER TABLE patients DROP COLUMN IF EXISTS CMName;

COMMIT;

-- ============================================
-- 正規化後の確認クエリ
-- ============================================

-- 1. テーブル構造の確認
SELECT
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'patients'
ORDER BY ordinal_position;

-- 2. 患者情報の統合確認（新しいビュー）
SELECT
    patientName,
    cm_name,
    office_name,
    vns_name
FROM patient_full_view
LIMIT 10;

-- 3. 訪問看護ステーションの業務量
SELECT * FROM vns_workload_view;

-- 4. データ正規化の統計
SELECT
    'Patients' AS entity,
    COUNT(*) AS total,
    COUNT(cm_id) AS with_cm,
    COUNT(vns_id) AS with_vns
FROM patients
UNION ALL
SELECT
    'Care Managers' AS entity,
    COUNT(*) AS total,
    COUNT(office_id) AS with_office,
    NULL AS with_vns
FROM care_managers
UNION ALL
SELECT
    'Care Offices' AS entity,
    COUNT(*) AS total,
    NULL AS with_office,
    NULL AS with_vns
FROM care_offices
UNION ALL
SELECT
    'VN Stations' AS entity,
    COUNT(*) AS total,
    NULL AS with_office,
    NULL AS with_vns
FROM visiting_nurse_stations;

-- ============================================
-- ロールバック用スクリプト（必要な場合）
-- ============================================
-- 以下のコマンドでバックアップから復元可能:
-- DROP TABLE patients;
-- ALTER TABLE patients_backup_before_normalization RENAME TO patients;