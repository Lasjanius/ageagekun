# データベース設計仕様書

## 概要
PostgreSQL 17を使用した正規化されたデータベース構造。患者情報、文書管理、RPA処理キューを管理。

## 接続情報
- **ホスト**: localhost:5432
- **データベース名**: ageagekun
- **ユーザー**: postgres
- **認証**: pgpass.conf (`C:\Users\hyosh\AppData\Roaming\postgresql\pgpass.conf`)

## テーブル構造

### マスターテーブル（正規化済み）

#### care_offices（居宅介護支援事業所）
```sql
CREATE TABLE care_offices (
    office_id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    address VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### care_managers（ケアマネージャー）
```sql
CREATE TABLE care_managers (
    cm_id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    office_id INTEGER REFERENCES care_offices(office_id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### visiting_nurse_stations（訪問看護ステーション）
```sql
CREATE TABLE visiting_nurse_stations (
    vns_id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    address VARCHAR(500),
    tel VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### patients（患者情報）
```sql
CREATE TABLE patients (
    patientID SERIAL PRIMARY KEY,
    patientName VARCHAR(255),
    address VARCHAR(500),
    birthdate DATE,
    cm_id INTEGER REFERENCES care_managers(cm_id),
    vns_id INTEGER REFERENCES visiting_nurse_stations(vns_id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 文書管理テーブル

#### Documents（v2.4.0で拡張）
```sql
CREATE TABLE Documents (
    fileID SERIAL PRIMARY KEY,
    fileName VARCHAR(255),
    patientID INTEGER REFERENCES patients(patientID),
    Category VARCHAR(100),
    FileType VARCHAR(50),
    pass VARCHAR(500),  -- ファイルの完全パス
    base_dir VARCHAR(500),  -- ディレクトリパス（ファイル名除く）
    isUploaded BOOLEAN DEFAULT false,
    is_ai_generated BOOLEAN DEFAULT false,  -- v2.4.0追加
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    uploaded_at TIMESTAMP
);
```

**重要なカラム**:
- `pass`: ファイルの完全パス
- `base_dir`: ファイルが存在するディレクトリパス
- `isUploaded`: アップロード状態（false=未アップロード、true=完了）
- `uploaded_at`: アップロード完了日時
- `is_ai_generated`: AI報告書作成フラグ（v2.4.0追加）

### RPA処理テーブル

#### rpa_queue
```sql
CREATE TABLE rpa_queue (
    id SERIAL PRIMARY KEY,
    file_id INTEGER REFERENCES Documents(fileID),
    patient_id INTEGER REFERENCES patients(patientID),
    payload JSONB,  -- PAD用データ
    status VARCHAR(20) DEFAULT 'pending',
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**statusカラムの値**：
- `pending`: 処理待ち
- `processing`: 処理中（PADが実行中）
- `done`: 完了（アップロード成功）
- `failed`: 失敗（エラーが発生）
- `canceled`: キャンセル（ユーザーによりキャンセル）

## ビュー定義

### patient_full_view（患者情報統合ビュー）
```sql
CREATE VIEW patient_full_view AS
SELECT
    p.patientID,
    p.patientName,
    p.address,
    p.birthdate,
    cm.name as cm_name,
    co.name as office_name,
    co.address as office_address,
    vns.name as vns_name,
    vns.address as vns_address,
    vns.tel as vns_tel
FROM patients p
LEFT JOIN care_managers cm ON p.cm_id = cm.cm_id
LEFT JOIN care_offices co ON cm.office_id = co.office_id
LEFT JOIN visiting_nurse_stations vns ON p.vns_id = vns.vns_id;
```

### rpa_queue_for_pad（PAD用ビュー）
```sql
CREATE VIEW rpa_queue_for_pad AS
SELECT
    q.id as queue_id,
    q.file_id,
    q.patient_id,
    q.status,
    q.error_message,
    q.payload->>'file_name' as file_name,
    q.payload->>'category' as category,
    q.payload->>'pass' as pass,
    q.payload->>'base_dir' as base_dir,
    q.payload->>'patient_name' as patient_name,
    q.created_at,
    q.updated_at
FROM rpa_queue q
ORDER BY q.created_at;
```

### cm_workload_view（ケアマネージャー業務量）
```sql
CREATE VIEW cm_workload_view AS
SELECT
    cm.cm_id,
    cm.name as cm_name,
    co.name as office_name,
    COUNT(DISTINCT p.patientID) as patient_count
FROM care_managers cm
LEFT JOIN care_offices co ON cm.office_id = co.office_id
LEFT JOIN patients p ON cm.cm_id = p.cm_id
GROUP BY cm.cm_id, cm.name, co.name;
```

## トリガー定義

### rpa_queue更新時の自動処理
```sql
CREATE OR REPLACE FUNCTION handle_rpa_queue_update()
RETURNS trigger AS $$
BEGIN
    IF NEW.status = 'done' AND OLD.status != 'done' THEN
        -- Documentsテーブルを更新
        UPDATE Documents
        SET isUploaded = true,
            uploaded_at = CURRENT_TIMESTAMP,
            pass = REPLACE(pass, base_dir, base_dir || '\uploaded'),
            base_dir = base_dir || '\uploaded'
        WHERE fileID = NEW.file_id;

        -- WebSocket通知
        PERFORM pg_notify('rpa_queue_update',
            json_build_object(
                'queue_id', NEW.id,
                'status', NEW.status,
                'file_id', NEW.file_id
            )::text
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER rpa_queue_update_trigger
AFTER UPDATE ON rpa_queue
FOR EACH ROW
EXECUTE FUNCTION handle_rpa_queue_update();
```

## インデックス

### パフォーマンス最適化用インデックス
```sql
-- Documents
CREATE INDEX idx_documents_patient ON Documents(patientID);
CREATE INDEX idx_documents_uploaded ON Documents(isUploaded);
CREATE INDEX idx_documents_category ON Documents(Category);
-- v2.4.0追加
CREATE INDEX idx_documents_ai_flag ON Documents(is_ai_generated);
CREATE INDEX idx_documents_created_at ON Documents(created_at);
CREATE INDEX idx_documents_patient_ai ON Documents(patientID, is_ai_generated, created_at);

-- rpa_queue
CREATE INDEX idx_rpa_queue_status ON rpa_queue(status);
CREATE INDEX idx_rpa_queue_created ON rpa_queue(created_at);

-- patients
CREATE INDEX idx_patients_name ON patients(patientName);
```

## データ移行

### レガシーカラムからの移行
```sql
-- CMName, homecareOfficeから正規化テーブルへの移行
-- 移行スクリプトはschema/migration/に配置
```

## 注意事項

### 文字コード
- データベースエンコーディング: UTF8
- 日本語文字列の適切な処理

### バックアップ
- 日次バックアップ推奨
- pg_dumpによる論理バックアップ

### パフォーマンス
- VACUUM定期実行
- 統計情報の更新（ANALYZE）