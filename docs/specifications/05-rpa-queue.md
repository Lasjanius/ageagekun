# RPA連携仕様書

## 概要
Power Automate Desktop (PAD)とPostgreSQLデータベースを連携し、モバカルネットへの自動アップロードを実現。

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
  3. 成功時：statusを'done'に更新
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

#### ステータス更新（成功）
```sql
UPDATE rpa_queue
SET status = 'done',
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

## トリガー連携

### アップロード完了時の処理
rpa_queueのstatusが'done'に更新されると、PostgreSQLトリガーが自動実行：

1. **Documentsテーブル更新**
   - isUploaded = true
   - uploaded_at = 現在時刻
   - パスを'uploaded'フォルダに更新

2. **ファイル移動**
   - 患者IDフォルダ直下 → uploaded/サブフォルダ

3. **WebSocket通知**
   - フロントエンドにリアルタイム通知

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