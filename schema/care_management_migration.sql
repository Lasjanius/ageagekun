-- ============================================
-- ケアマネージャー管理システム
-- データ移行スクリプト
-- ============================================

-- このスクリプトは以下の順序で実行します：
-- 1. 既存のCMNameとhomecareOfficeから一意なデータを抽出
-- 2. care_officesテーブルにデータを投入
-- 3. care_managersテーブルにデータを投入
-- 4. patientsテーブルのcm_idを更新
-- 5. CMNameカラムを削除

BEGIN;

-- ============================================
-- STEP 1: 既存データの確認
-- ============================================
-- 現在のCMNameの一覧を確認
SELECT DISTINCT CMName
FROM patients
WHERE CMName IS NOT NULL AND CMName != ''
ORDER BY CMName;

-- 現在のhomecareOfficeの一覧を確認
SELECT DISTINCT homecareOffice
FROM patients
WHERE homecareOffice IS NOT NULL AND homecareOffice != ''
ORDER BY homecareOffice;

-- ============================================
-- STEP 2: care_officesテーブルへのデータ投入
-- ============================================
-- homecareOfficeから一意な事業所を抽出して投入
INSERT INTO care_offices (name, address)
SELECT DISTINCT
    homecareOffice AS name,
    '住所は後で更新してください' AS address
FROM patients
WHERE homecareOffice IS NOT NULL AND homecareOffice != ''
  AND NOT EXISTS (
      SELECT 1 FROM care_offices co
      WHERE co.name = patients.homecareOffice
  );

-- デフォルト事業所を追加（事業所が不明なケアマネージャー用）
INSERT INTO care_offices (name, address)
SELECT '未設定', '住所未設定'
WHERE NOT EXISTS (
    SELECT 1 FROM care_offices WHERE name = '未設定'
);

-- ============================================
-- STEP 3: care_managersテーブルへのデータ投入
-- ============================================
-- CMNameから一意なケアマネージャーを抽出
-- 事業所との関連付けは後で手動で更新が必要
WITH unique_cms AS (
    SELECT DISTINCT
        CMName,
        -- 同じCMNameで最も多く使われているhomecareOfficeを取得
        (SELECT homecareOffice
         FROM patients p2
         WHERE p2.CMName = p1.CMName
           AND homecareOffice IS NOT NULL
         GROUP BY homecareOffice
         ORDER BY COUNT(*) DESC
         LIMIT 1) AS most_common_office
    FROM patients p1
    WHERE CMName IS NOT NULL AND CMName != ''
)
INSERT INTO care_managers (name, office_id)
SELECT
    uc.CMName AS name,
    COALESCE(co.office_id, (SELECT office_id FROM care_offices WHERE name = '未設定')) AS office_id
FROM unique_cms uc
LEFT JOIN care_offices co ON co.name = uc.most_common_office
WHERE NOT EXISTS (
    SELECT 1 FROM care_managers cm
    WHERE cm.name = uc.CMName
);

-- ============================================
-- STEP 4: patientsテーブルのcm_id更新
-- ============================================
-- CMNameを基にcm_idを設定
UPDATE patients p
SET cm_id = cm.cm_id
FROM care_managers cm
WHERE p.CMName = cm.name
  AND p.cm_id IS NULL;

-- 更新結果の確認
SELECT
    COUNT(*) AS total_patients,
    COUNT(cm_id) AS patients_with_cm_id,
    COUNT(CMName) AS patients_with_cmname,
    COUNT(*) - COUNT(cm_id) AS patients_without_cm_id
FROM patients;

-- ============================================
-- STEP 5: データ移行の検証
-- ============================================
-- CMNameとcm_idの整合性確認
SELECT
    p.patientID,
    p.patientName,
    p.CMName AS old_cmname,
    cm.name AS new_cm_name,
    CASE
        WHEN p.CMName = cm.name THEN '✓ 一致'
        WHEN p.CMName IS NULL AND cm.name IS NULL THEN '✓ 両方NULL'
        ELSE '✗ 不一致'
    END AS status
FROM patients p
LEFT JOIN care_managers cm ON p.cm_id = cm.cm_id
WHERE p.CMName IS NOT NULL OR p.cm_id IS NOT NULL
LIMIT 20;

-- ============================================
-- STEP 6: CMNameカラムの削除
-- ============================================
-- 警告: この操作は元に戻せません！
-- 実行前に必ずバックアップを取得してください

-- CMNameカラムを削除する前の最終確認
DO $$
DECLARE
    unmapped_count INTEGER;
BEGIN
    -- cm_idが設定されていないがCMNameがある患者の数を確認
    SELECT COUNT(*) INTO unmapped_count
    FROM patients
    WHERE CMName IS NOT NULL AND CMName != ''
      AND cm_id IS NULL;

    IF unmapped_count > 0 THEN
        RAISE NOTICE '警告: % 名の患者でCMNameは設定されていますがcm_idが未設定です', unmapped_count;
        RAISE NOTICE 'CMNameカラムを削除する前に、これらのデータを確認してください';
        -- エラーを発生させて処理を中断
        RAISE EXCEPTION 'データ移行が不完全です。CMNameカラムの削除を中止します。';
    ELSE
        RAISE NOTICE '✓ すべてのCMNameデータが正常にcm_idに移行されました';
    END IF;
END $$;

-- トリガーの削除（CMNameカラムを使用しているトリガーがある場合）
DROP TRIGGER IF EXISTS patient_cmname_to_cmid_trigger ON patients;

-- CMNameカラムの削除
ALTER TABLE patients DROP COLUMN IF EXISTS CMName;

-- homecareOfficeカラムも不要になるため削除（オプション）
-- 注意: このカラムを他の機能で使用している場合は削除しないでください
-- ALTER TABLE patients DROP COLUMN IF EXISTS homecareOffice;

COMMIT;

-- ============================================
-- 移行後の確認クエリ
-- ============================================

-- 1. 患者とケアマネージャーの関連確認
SELECT * FROM patient_full_view LIMIT 10;

-- 2. ケアマネージャーごとの担当患者数
SELECT * FROM cm_workload_view;

-- 3. 事業所ごとの統計
SELECT * FROM office_statistics_view;

-- 4. データの整合性確認
SELECT
    'Patients' AS table_name,
    COUNT(*) AS total_count,
    COUNT(cm_id) AS with_cm_count,
    COUNT(*) - COUNT(cm_id) AS without_cm_count
FROM patients
UNION ALL
SELECT
    'Care Managers' AS table_name,
    COUNT(*) AS total_count,
    COUNT(office_id) AS with_office_count,
    COUNT(*) - COUNT(office_id) AS without_office_count
FROM care_managers
UNION ALL
SELECT
    'Care Offices' AS table_name,
    COUNT(*) AS total_count,
    COUNT(*) AS with_office_count,
    0 AS without_office_count
FROM care_offices;