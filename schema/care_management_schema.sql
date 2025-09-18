-- ============================================
-- ケアマネージャー管理システム
-- テーブル定義とビュー作成
-- ============================================

-- 1. ケアオフィステーブルの作成
CREATE TABLE IF NOT EXISTS care_offices (
    office_id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    address TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. ケアマネージャーテーブルの作成
CREATE TABLE IF NOT EXISTS care_managers (
    cm_id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    office_id INTEGER REFERENCES care_offices(office_id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. 訪問看護ステーションテーブルの作成
CREATE TABLE IF NOT EXISTS visiting_nurse_stations (
    vns_id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    address TEXT,
    tel VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. patientsテーブルへcm_idとvns_idカラムの追加
ALTER TABLE patients
ADD COLUMN IF NOT EXISTS cm_id INTEGER REFERENCES care_managers(cm_id) ON DELETE SET NULL;

ALTER TABLE patients
ADD COLUMN IF NOT EXISTS vns_id INTEGER REFERENCES visiting_nurse_stations(vns_id) ON DELETE SET NULL;

-- 5. インデックスの作成（パフォーマンス向上）
CREATE INDEX IF NOT EXISTS idx_care_managers_office_id ON care_managers(office_id);
CREATE INDEX IF NOT EXISTS idx_patients_cm_id ON patients(cm_id);
CREATE INDEX IF NOT EXISTS idx_patients_vns_id ON patients(vns_id);
CREATE INDEX IF NOT EXISTS idx_vns_name ON visiting_nurse_stations(name);

-- 6. 患者情報統合ビュー（患者 + ケアマネージャー + 事業所 + 訪問看護）
CREATE OR REPLACE VIEW patient_full_view AS
SELECT
    p.patientID,
    p.patientName,
    p.address,
    p.birthdate,
    cm.cm_id,
    cm.name AS cm_name,
    co.office_id,
    co.name AS office_name,
    co.address AS office_address,
    vns.vns_id,
    vns.name AS vns_name,
    vns.address AS vns_address,
    vns.tel AS vns_tel,
    p.created_at
FROM patients p
LEFT JOIN care_managers cm ON p.cm_id = cm.cm_id
LEFT JOIN care_offices co ON cm.office_id = co.office_id
LEFT JOIN visiting_nurse_stations vns ON p.vns_id = vns.vns_id;

-- 7. ケアマネージャー業務量ビュー
CREATE OR REPLACE VIEW cm_workload_view AS
SELECT
    cm.cm_id,
    cm.name AS cm_name,
    co.name AS office_name,
    co.address AS office_address,
    COUNT(p.patientID) AS patient_count,
    cm.created_at AS cm_registered_date
FROM care_managers cm
LEFT JOIN care_offices co ON cm.office_id = co.office_id
LEFT JOIN patients p ON cm.cm_id = p.cm_id
GROUP BY cm.cm_id, cm.name, co.office_id, co.name, co.address, cm.created_at
ORDER BY patient_count DESC;

-- 8. 訪問看護ステーション業務量ビュー
CREATE OR REPLACE VIEW vns_workload_view AS
SELECT
    vns.vns_id,
    vns.name AS vns_name,
    vns.address AS vns_address,
    vns.tel AS vns_tel,
    COUNT(p.patientID) AS patient_count,
    vns.created_at AS vns_registered_date
FROM visiting_nurse_stations vns
LEFT JOIN patients p ON vns.vns_id = p.vns_id
GROUP BY vns.vns_id, vns.name, vns.address, vns.tel, vns.created_at
ORDER BY patient_count DESC;

-- 9. 事業所統計ビュー
CREATE OR REPLACE VIEW office_statistics_view AS
SELECT
    co.office_id,
    co.name AS office_name,
    co.address AS office_address,
    COUNT(DISTINCT cm.cm_id) AS cm_count,
    COUNT(DISTINCT p.patientID) AS total_patients,
    co.created_at AS office_registered_date
FROM care_offices co
LEFT JOIN care_managers cm ON co.office_id = cm.office_id
LEFT JOIN patients p ON cm.cm_id = p.cm_id
GROUP BY co.office_id, co.name, co.address, co.created_at
ORDER BY total_patients DESC;

-- 10. 更新日時トリガーの作成（visiting_nurse_stations用）
CREATE TRIGGER update_visiting_nurse_stations_updated_at
BEFORE UPDATE ON visiting_nurse_stations
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

-- 10. 更新日時自動更新関数
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 11. 更新日時トリガーの作成
CREATE TRIGGER update_care_offices_updated_at
BEFORE UPDATE ON care_offices
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_care_managers_updated_at
BEFORE UPDATE ON care_managers
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

-- ============================================
-- 使用例
-- ============================================
-- 事業所の登録:
-- INSERT INTO care_offices (name, address) VALUES ('ケアプランセンターやまと', '〒242-0001 神奈川県大和市中央1-2-3');
--
-- ケアマネージャーの登録:
-- INSERT INTO care_managers (name, office_id) VALUES ('山田太郎', 1);
--
-- 患者情報の確認:
-- SELECT * FROM patient_full_view WHERE patientID = 1;
--
-- ケアマネージャーの担当患者数確認:
-- SELECT * FROM cm_workload_view;
--
-- 事業所の統計確認:
-- SELECT * FROM office_statistics_view;