-- =============================================================================
-- レガシー列同期用トリガー
-- 外部キー更新時に対応するレガシー列（文字列）を自動更新
-- =============================================================================

-- 患者テーブルのレガシー列を同期するトリガー関数
CREATE OR REPLACE FUNCTION sync_patient_legacy_columns()
RETURNS TRIGGER AS $$
BEGIN
    -- cm_id が更新された場合、cmname と homecareoffice を更新
    IF NEW.cm_id IS DISTINCT FROM OLD.cm_id THEN
        IF NEW.cm_id IS NOT NULL THEN
            -- ケアマネージャー名を取得
            SELECT cm.name INTO NEW.cmname
            FROM care_managers cm
            WHERE cm.cm_id = NEW.cm_id;

            -- 居宅介護支援事業所名を取得
            SELECT co.name INTO NEW.homecareoffice
            FROM care_managers cm
            JOIN care_offices co ON cm.office_id = co.office_id
            WHERE cm.cm_id = NEW.cm_id;
        ELSE
            -- NULL の場合はレガシー列もクリア（任意の設定）
            -- コメントアウトすることで、NULL設定時は既存値を維持することも可能
            -- NEW.cmname := NULL;
            -- NEW.homecareoffice := NULL;
        END IF;
    END IF;

    -- vns_id が更新された場合、visitingnurse を更新
    IF NEW.vns_id IS DISTINCT FROM OLD.vns_id THEN
        IF NEW.vns_id IS NOT NULL THEN
            SELECT name INTO NEW.visitingnurse
            FROM visiting_nurse_stations
            WHERE vns_id = NEW.vns_id;
        ELSE
            -- NULL の場合の処理（任意）
            -- NEW.visitingnurse := NULL;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 既存のトリガーがあれば削除
DROP TRIGGER IF EXISTS sync_patient_legacy_trigger ON patients;

-- 患者テーブルに同期トリガーを設定
CREATE TRIGGER sync_patient_legacy_trigger
    BEFORE INSERT OR UPDATE ON patients
    FOR EACH ROW
    EXECUTE FUNCTION sync_patient_legacy_columns();

-- =============================================================================
-- 既存データの初期同期（オプション）
-- 既存レコードのレガシー列を外部キーに基づいて更新
-- =============================================================================

-- ケアマネージャー関連のレガシー列を更新
UPDATE patients p
SET
    cmname = cm.name,
    homecareoffice = co.name
FROM care_managers cm
LEFT JOIN care_offices co ON cm.office_id = co.office_id
WHERE p.cm_id = cm.cm_id
  AND p.cm_id IS NOT NULL;

-- 訪問看護ステーション関連のレガシー列を更新
UPDATE patients p
SET visitingnurse = vns.name
FROM visiting_nurse_stations vns
WHERE p.vns_id = vns.vns_id
  AND p.vns_id IS NOT NULL;

-- =============================================================================
-- 逆引き同期関数（オプション）
-- レガシー列から外部キーを設定する関数
-- 移行期間中に手動で実行可能
-- =============================================================================

CREATE OR REPLACE FUNCTION sync_legacy_to_foreign_keys()
RETURNS void AS $$
DECLARE
    updated_count INTEGER := 0;
BEGIN
    -- cmname から cm_id を設定
    UPDATE patients p
    SET cm_id = cm.cm_id
    FROM care_managers cm
    WHERE p.cmname = cm.name
      AND p.cm_id IS NULL
      AND p.cmname IS NOT NULL;

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RAISE NOTICE 'Updated % records with cm_id', updated_count;

    -- visitingnurse から vns_id を設定
    UPDATE patients p
    SET vns_id = vns.vns_id
    FROM visiting_nurse_stations vns
    WHERE p.visitingnurse = vns.name
      AND p.vns_id IS NULL
      AND p.visitingnurse IS NOT NULL;

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RAISE NOTICE 'Updated % records with vns_id', updated_count;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 整合性チェック用ビュー
-- レガシー列と外部キーの不整合を検出
-- =============================================================================

CREATE OR REPLACE VIEW patient_legacy_sync_check AS
SELECT
    p.patientid,
    p.patientname,
    p.cmname AS legacy_cmname,
    cm.name AS fk_cmname,
    CASE
        WHEN p.cm_id IS NULL AND p.cmname IS NOT NULL THEN 'Legacy only'
        WHEN p.cm_id IS NOT NULL AND p.cmname IS NULL THEN 'FK only'
        WHEN p.cmname != cm.name THEN 'Mismatch'
        WHEN p.cm_id IS NOT NULL AND p.cmname = cm.name THEN 'Synced'
        ELSE 'Both NULL'
    END AS cm_sync_status,
    p.visitingnurse AS legacy_vns,
    vns.name AS fk_vns,
    CASE
        WHEN p.vns_id IS NULL AND p.visitingnurse IS NOT NULL THEN 'Legacy only'
        WHEN p.vns_id IS NOT NULL AND p.visitingnurse IS NULL THEN 'FK only'
        WHEN p.visitingnurse != vns.name THEN 'Mismatch'
        WHEN p.vns_id IS NOT NULL AND p.visitingnurse = vns.name THEN 'Synced'
        ELSE 'Both NULL'
    END AS vns_sync_status,
    p.homecareoffice AS legacy_office,
    co.name AS fk_office,
    CASE
        WHEN cm.office_id IS NULL THEN 'No office'
        WHEN p.homecareoffice != co.name THEN 'Mismatch'
        WHEN p.homecareoffice = co.name THEN 'Synced'
        ELSE 'Unknown'
    END AS office_sync_status
FROM patients p
LEFT JOIN care_managers cm ON p.cm_id = cm.cm_id
LEFT JOIN care_offices co ON cm.office_id = co.office_id
LEFT JOIN visiting_nurse_stations vns ON p.vns_id = vns.vns_id;

-- =============================================================================
-- 使用例とコメント
-- =============================================================================

COMMENT ON FUNCTION sync_patient_legacy_columns() IS
'患者テーブルの外部キー更新時にレガシー列を自動同期するトリガー関数';

COMMENT ON FUNCTION sync_legacy_to_foreign_keys() IS
'レガシー列の値から外部キーを設定する移行用関数。手動実行用。';

COMMENT ON VIEW patient_legacy_sync_check IS
'レガシー列と外部キーの同期状態を確認するビュー。不整合検出に使用。';

-- 同期状態の確認例
-- SELECT * FROM patient_legacy_sync_check WHERE cm_sync_status != 'Synced' OR vns_sync_status != 'Synced';

-- 手動同期の実行例
-- SELECT sync_legacy_to_foreign_keys();