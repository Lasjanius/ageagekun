-- ============================================
-- ケアマネージャー管理システム
-- テストデータ投入スクリプト
-- ============================================

BEGIN;

-- ============================================
-- テスト用事業所データ
-- ============================================
INSERT INTO care_offices (name, address) VALUES
    ('ケアプランセンターやまと', '〒242-0001 神奈川県大和市中央1-2-3'),
    ('介護支援センターさくら', '〒242-0003 神奈川県大和市林間2-15-8'),
    ('ケアオフィスひまわり', '〒242-0005 神奈川県大和市西鶴間3-10-5'),
    ('訪問介護ステーション虹', '〒242-0007 神奈川県大和市中央林間4-20-15');

-- ============================================
-- テスト用ケアマネージャーデータ
-- ============================================
INSERT INTO care_managers (name, office_id) VALUES
    ('山田太郎', 1),
    ('佐藤花子', 1),
    ('鈴木一郎', 2),
    ('田中美咲', 2),
    ('高橋健太', 3),
    ('渡辺真理', 3),
    ('伊藤次郎', 4),
    ('中村愛', 4);

-- ============================================
-- テスト用患者データ（新規）
-- ============================================
-- 注意：既存のpatientsテーブルにデータがある場合はスキップしてください
DO $$
DECLARE
    patient_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO patient_count FROM patients;

    IF patient_count = 0 THEN
        -- 患者データが空の場合のみテストデータを投入
        INSERT INTO patients (patientName, address, birthdate, cm_id, visitingNurse) VALUES
            ('テスト太郎', '神奈川県大和市中央1-1-1', '1940-01-15', 1, '訪問看護ステーションA'),
            ('テスト花子', '神奈川県大和市林間2-2-2', '1935-03-20', 1, '訪問看護ステーションA'),
            ('テスト次郎', '神奈川県大和市西鶴間3-3-3', '1945-07-10', 2, '訪問看護ステーションB'),
            ('テスト美咲', '神奈川県大和市中央林間4-4-4', '1938-11-25', 2, '訪問看護ステーションB'),
            ('テスト健太', '神奈川県大和市南林間5-5-5', '1942-05-08', 3, '訪問看護ステーションC'),
            ('テスト真理', '神奈川県大和市上草柳6-6-6', '1937-09-14', 3, '訪問看護ステーションC'),
            ('テスト一郎', '神奈川県大和市下鶴間7-7-7', '1943-12-30', 4, '訪問看護ステーションD'),
            ('テスト愛', '神奈川県大和市深見8-8-8', '1936-06-18', 4, '訪問看護ステーションD'),
            ('テスト三郎', '神奈川県大和市大和東9-9-9', '1941-02-22', 5, '訪問看護ステーションE'),
            ('テスト幸子', '神奈川県大和市大和南10-10-10', '1939-08-05', 5, '訪問看護ステーションE');

        RAISE NOTICE 'テスト用患者データを10件追加しました';
    ELSE
        RAISE NOTICE '既存の患者データが存在するため、テスト患者データの追加をスキップしました';
    END IF;
END $$;

COMMIT;

-- ============================================
-- テストデータの確認
-- ============================================

-- 1. 投入されたデータの件数確認
SELECT
    'care_offices' AS table_name, COUNT(*) AS count
FROM care_offices
UNION ALL
SELECT
    'care_managers' AS table_name, COUNT(*) AS count
FROM care_managers
UNION ALL
SELECT
    'patients with cm_id' AS table_name, COUNT(*) AS count
FROM patients WHERE cm_id IS NOT NULL;

-- 2. 事業所とケアマネージャーの関係確認
SELECT
    co.name AS office_name,
    COUNT(cm.cm_id) AS cm_count
FROM care_offices co
LEFT JOIN care_managers cm ON co.office_id = cm.office_id
GROUP BY co.office_id, co.name
ORDER BY co.name;

-- 3. ケアマネージャーと患者の関係確認
SELECT
    cm.name AS cm_name,
    co.name AS office_name,
    COUNT(p.patientID) AS patient_count
FROM care_managers cm
LEFT JOIN care_offices co ON cm.office_id = co.office_id
LEFT JOIN patients p ON cm.cm_id = p.cm_id
GROUP BY cm.cm_id, cm.name, co.name
ORDER BY cm.name;

-- 4. 患者情報の統合ビュー確認
SELECT
    patientName,
    cm_name,
    office_name,
    office_address
FROM patient_full_view
LIMIT 10;

-- 5. ケアマネージャー業務量の確認
SELECT * FROM cm_workload_view;

-- 6. 事業所統計の確認
SELECT * FROM office_statistics_view;