# RPA連携仕様書

## 概要
Power Automate Desktop (PAD)とPostgreSQLデータベースを連携し、モバカルネットへの自動アップロードを実現。

## 新ステータスフロー（v4.1.0）

### ステータス遷移図
```
旧フロー: pending → processing → done
新フロー: pending → processing → uploaded → ready_to_print → done
```

### ステータス定義
| ステータス | 説明 | 次のステータス | 責任者 |
|-----------|------|---------------|--------|
| pending | 処理待ち | processing | PAD |
| processing | アップロード中 | uploaded/failed | PAD |
| uploaded | アップロード完了 | ready_to_print | システム（自動） |
| ready_to_print | 印刷待機中 | merging/done | PDF連結/手動操作 |
| merging | PDF連結処理中 | done/merging | システム/エラー時維持 |
| done | 全処理完了 | - | - |
| failed | エラー | - | 手動復旧 |
| canceled | キャンセル | - | - |

### ステータス遷移の詳細
1. **pending → processing**: PADがタスクを取得して処理開始
2. **processing → uploaded**: PADがモバカルネットへのアップロード完了
3. **uploaded → ready_to_print**: トリガーによる自動ファイル移動後
4. **ready_to_print → merging**: PDF連結処理開始時
5. **merging → done**: PDF連結成功時
6. **merging → merging**: PDF連結失敗時（エラー可視化のため維持）
7. **ready_to_print → done**: 個別印刷完了時
8. **any → failed**: エラー発生時

## PAD側の処理フロー（自律処理）

### 初期設定
1. PostgreSQLへの接続を確立（ODBC接続、接続は維持）
2. ログファイルの初期化

### メインループ（無限ループ）
- 5秒ごとにrpa_queueテーブルを監視
- SQL接続は開いたまま維持（効率化）

### タスク処理ループ（Whileループ）
- pendingタスクをSELECTで取得（ORDER BY created_at）
- タスクが存在する場合：
  1. statusを'processing'に更新
  2. モバカルネットにファイルをアップロード
  3. 成功時：statusを'uploaded'に更新（**変更点**）
  4. 失敗時：statusを'failed'に更新、エラー内容を記録
- タスクがなくなるまで連続処理
- 全て処理したら5秒待機してメインループへ

## PAD実装詳細ガイド

### 変数定義
```
# データベース接続
%DBConnection%
%ConnectionString% = "Driver={PostgreSQL ODBC Driver(UNICODE)};Server=localhost;Port=5432;Database=ageagekun;Uid=postgres;Pwd=rad1ohead;"

# 処理用変数
%QueueData%
%CurrentQueueId%
%ProcessingResult%
%ErrorMessage%

# 監視設定
%PollingInterval% = 5  # 秒
%ProcessTimeout% = 60  # 秒
```

### SQL操作

#### pendingタスクの取得
```sql
SELECT * FROM rpa_queue_for_pad
WHERE status = 'pending'
ORDER BY created_at
LIMIT 1;
```

#### ステータス更新（処理中）
```sql
UPDATE rpa_queue
SET status = 'processing',
    updated_at = CURRENT_TIMESTAMP
WHERE id = %CurrentQueueId%;
```

#### ステータス更新（アップロード成功）
```sql
UPDATE rpa_queue
SET status = 'uploaded',
    updated_at = CURRENT_TIMESTAMP
WHERE id = %CurrentQueueId%;
```

#### ステータス更新（失敗）
```sql
UPDATE rpa_queue
SET status = 'failed',
    error_message = %ErrorMessage%,
    updated_at = CURRENT_TIMESTAMP
WHERE id = %CurrentQueueId%;
```

## モバカルネット UI操作

### アップロード手順
1. **患者検索**
   - AutomationId: `patient_search_top`
   - 患者ID（8桁）を入力

2. **書類BOXナビゲーション**
   - 患者詳細画面から「書類BOX」をクリック

3. **書類追加**
   - 「書類追加」ボタンをクリック

4. **ファイル選択**
   - ファイルパス: `%pass%`（rpa_queueから取得）

5. **カテゴリ設定**
   - AutomationId: `category_id_select`
   - カテゴリ値: `%category%`（rpa_queueから取得）

6. **アップロード実行**
   - 「アップロード」ボタンをクリック

### エラーハンドリング

#### タイムアウト処理
```
IF %ElapsedTime% > %ProcessTimeout% THEN
    SET %ErrorMessage% = "アップロードタイムアウト"
    UPDATE rpa_queue SET status = 'failed'
END IF
```

#### ファイル不在
```
IF NOT FileExists(%pass%) THEN
    SET %ErrorMessage% = "ファイルが見つかりません: " + %pass%
    UPDATE rpa_queue SET status = 'failed'
END IF
```

#### UI要素不在
```
ON ERROR
    SET %ErrorMessage% = "UI要素が見つかりません"
    UPDATE rpa_queue SET status = 'failed'
    CONTINUE  # 次のタスクへ
END ON ERROR
```

## データベースビュー（PAD用）

### rpa_queue_for_pad
```sql
CREATE VIEW rpa_queue_for_pad AS
SELECT
    q.id as queue_id,
    q.file_id,
    q.patient_id,
    q.status,
    q.error_message,
    -- payloadから必要な情報を展開
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

## トリガー連携（v4.1.0拡張）

### ready_to_printステータス自動遷移
rpa_queueのstatusが'uploaded'に更新されると、PostgreSQLトリガーが自動実行：

1. **Documentsテーブル更新**
   - isUploaded = true
   - uploaded_at = 現在時刻
   - パスを'uploaded'フォルダに更新

2. **ファイル移動通知**
   - Node.jsサービスにpg_notify経由でファイル移動要求
   - 患者IDフォルダ直下 → uploaded/サブフォルダ

3. **ready_to_printへの自動遷移**
   - ファイル移動完了後、statusを'ready_to_print'に更新

4. **WebSocket通知**
   - フロントエンドにリアルタイム通知

### トリガー関数の詳細
```sql
CREATE OR REPLACE FUNCTION auto_update_document_on_ready_to_print()
RETURNS trigger AS $$
DECLARE
    old_path TEXT;
    new_path TEXT;
    base_dir_path TEXT;
BEGIN
    -- uploadedステータス時にファイル移動とDocuments更新
    IF NEW.status = 'uploaded' AND OLD.status = 'processing' THEN
        -- 現在のパスを取得
        SELECT pass, base_dir INTO old_path, base_dir_path FROM Documents WHERE fileID = NEW.file_id;

        -- パスが存在し、まだuploadedフォルダに入っていない場合のみ処理
        IF old_path IS NOT NULL AND old_path NOT LIKE '%\uploaded\%' THEN
            -- 新しいパスを計算（uploadedサブディレクトリを追加）
            new_path := regexp_replace(
                old_path,
                '(C:\\Users\\hyosh\\Desktop\\allright\\ageagekun\\patients\\[0-9]+)\\(.+)$',
                E'\\1\\\\uploaded\\\\\\2'
            );

            -- Documentsテーブルを更新
            UPDATE Documents
            SET
                isUploaded = TRUE,
                uploaded_at = CURRENT_TIMESTAMP,
                pass = new_path,
                base_dir = base_dir_path || '\uploaded'
            WHERE fileID = NEW.file_id;

            -- Node.jsにファイル移動を通知
            PERFORM pg_notify('file_movement_required',
                json_build_object(
                    'file_id', NEW.file_id,
                    'old_path', old_path,
                    'new_path', new_path
                )::text
            );
        END IF;

        -- uploadedからready_to_printへ自動遷移
        UPDATE rpa_queue
        SET status = 'ready_to_print', updated_at = CURRENT_TIMESTAMP
        WHERE id = NEW.id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

## ログ管理

### PADログファイル
```
C:\Users\hyosh\Desktop\allright\ageagekun\logs\pad_upload.log
```

### ログ形式
```
[2025-01-18 10:00:00] INFO: 処理開始 - Queue ID: 123
[2025-01-18 10:00:05] SUCCESS: アップロード完了 - File: 居宅レポート.pdf
[2025-01-18 10:00:10] ERROR: アップロード失敗 - Queue ID: 124, エラー: ファイル不在
```

## パフォーマンス最適化

### バッチ処理
- 一度に複数のpendingタスクを処理
- DB接続は維持したまま連続処理

### 並列処理の回避
- 同時に複数のPADインスタンスを起動しない
- 排他制御はstatus='processing'で実現

### エラー復帰
- failed状態のタスクは手動で再実行
- 自動リトライは実装しない（無限ループ防止）

## 監視項目

### キュー状態
```sql
-- 処理待ちキュー数
SELECT COUNT(*) FROM rpa_queue WHERE status = 'pending';

-- 失敗キュー一覧
SELECT * FROM rpa_queue WHERE status = 'failed'
ORDER BY updated_at DESC;

-- 処理統計
SELECT
    status,
    COUNT(*) as count,
    DATE(created_at) as date
FROM rpa_queue
GROUP BY status, DATE(created_at);
```

## API エンドポイント（v4.1.0追加）

### 新しいステータス更新エンドポイント
| エンドポイント | 説明 | 遷移 | 呼び出し元 |
|--------------|------|------|----------|
| PUT /api/queue/:id/processing | 処理開始 | pending → processing | PAD |
| PUT /api/queue/:id/uploaded | アップロード完了 | processing → uploaded | PAD |
| PUT /api/queue/:id/ready-to-print | 印刷準備完了 | uploaded → ready_to_print | システム（自動） |
| PUT /api/queue/:id/done | 印刷完了 | ready_to_print → done | 手動/UI |
| PUT /api/queue/:id/failed | エラー | any → failed | PAD/システム |

### 後方互換性
- `PUT /api/queue/:id/complete` は `uploaded` へリダイレクト（非推奨）

### レスポンス例
```json
{
  "success": true,
  "message": "Status updated to ready_to_print",
  "data": {
    "id": 25,
    "file_id": 15,
    "patient_id": 99999998,
    "status": "ready_to_print",
    "updated_at": "2025-09-21T10:30:00.000Z"
  }
}
```

## フロントエンド表示仕様

### ステータス表示設定
| ステータス | ラベル | アイコン | 色 | 背景色 |
|-----------|--------|---------|----|---------|
| pending | 処理待ち | ⏳ | #6c757d | rgba(108, 117, 125, 0.1) |
| processing | 処理中 | 🔄 | #007bff | rgba(0, 123, 255, 0.1) |
| uploaded | アップロード完了 | ☁️ | #17a2b8 | rgba(23, 162, 184, 0.1) |
| ready_to_print | 印刷待ち | 🖨️ | #ffc107 | rgba(255, 193, 7, 0.1) |
| merging | 連結処理中 | 📑 | #ff9800 | rgba(255, 152, 0, 0.1) |
| done | 完了 | ✅ | #28a745 | rgba(40, 167, 69, 0.1) |
| failed | エラー | ❌ | #dc3545 | rgba(220, 53, 69, 0.1) |
| canceled | キャンセル | ⛔ | #6c757d | rgba(108, 117, 125, 0.1) |

### CSS クラス定義
```css
.queue-row--pending { border-left: 4px solid #6c757d; }
.queue-row--processing { border-left: 4px solid #007bff; }
.queue-row--uploaded { border-left: 4px solid #17a2b8; }
.queue-row--print-ready { border-left: 4px solid #ffc107; }
.queue-row--merging { border-left: 4px solid #ff9800; }
.queue-row--done { border-left: 4px solid #28a745; }
.queue-row--failed { border-left: 4px solid #dc3545; }
.queue-row--canceled { border-left: 4px solid #6c757d; }
```

## トラブルシューティング

### よくある問題

#### PADがタスクを検出しない
- PostgreSQL接続確認
- rpa_queue_for_padビューの確認
- pending状態のレコード存在確認

#### アップロードが失敗する
- ファイルパスの確認
- モバカルネットのログイン状態
- UI要素のAutomationId変更確認

#### 処理が停止する
- processing状態で止まったレコードを確認
- PADプロセスの強制終了と再起動
- 手動でstatusを'failed'に変更

#### ready_to_printステータスで停止する
- ファイル移動の確認（uploadedフォルダの存在）
- Documents.passパスの重複uploaded問題の確認
- トリガー関数の実行ログ確認

#### mergingステータスのまま残る
- PDF連結時にエラーが発生した場合の可視化
- 破損PDFまたはアクセスできないファイル
- batch_prints.failed_idsで確認可能
- 手動で'done'または'failed'に変更して解決

#### ステータス移行の確認
```sql
-- 現在のキュー状況確認
SELECT status, COUNT(*) FROM rpa_queue GROUP BY status;

-- 特定ファイルのステータス履歴確認
SELECT id, file_id, status, created_at, updated_at
FROM rpa_queue
WHERE file_id = [file_id]
ORDER BY updated_at DESC;

-- アップロード重複問題の確認
SELECT fileID, fileName, pass, base_dir
FROM Documents
WHERE pass LIKE '%\uploaded\uploaded%';
```