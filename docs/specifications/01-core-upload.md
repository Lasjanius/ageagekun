# 基本アップロード機能仕様書

## 概要
PADと連動して、書類を電子カルテ（モバカルネット）に自動アップロードする中核機能。

## 処理フロー

### Webアプリ側の処理
1. フロントから"All Upload"のリクエストを受け取る
2. DBを走査してisUploaded=falseの書類をリストアップ
3. 未アップロード書類の一覧（patientid, category, patientname, filename, pass, fileid）をUIに表示
4. ユーザーが確認してOKを押す
5. 各ファイルごとにrpa_queueテーブルにタスクを登録（status='pending'）

### ファイル管理構造
```
C:\Users\hyosh\Desktop\allright\ageagekun\patients\
└── [patientID]\
    ├── ファイル1.pdf (未アップロード: isUploaded=false)
    ├── ファイル2.pdf (未アップロード: isUploaded=false)
    └── uploaded\
        ├── ファイル3.pdf (アップロード済み: isUploaded=true)
        └── ファイル4.pdf (アップロード済み: isUploaded=true)
```

**ファイル配置ルール**：
- すべてのファイルは患者IDディレクトリ（8桁ゼロパディング）内に配置
- `isUploaded=false`: 患者IDディレクトリ直下
  - 例: `C:\Users\hyosh\Desktop\allright\ageagekun\patients\99999999\居宅レポート.pdf`
- `isUploaded=true`: uploadedサブディレクトリ内
  - 例: `C:\Users\hyosh\Desktop\allright\ageagekun\patients\99999999\uploaded\居宅レポート.pdf`
- アップロード完了後、アプリ側でファイルをuploadedフォルダに移動
- Documents.passカラムは移動後の新しいパスに更新される

## キャンセル処理フロー
アップロード処理実行中にユーザーがキャンセルを要求した場合の処理：

### フロントエンド側
1. アップロードモーダルの「キャンセル」ボタンをクリック
2. 確認ダイアログ表示「アップロード処理をキャンセルしますか？※実行中のRPAは手動で停止してください」
3. ユーザーが確認した場合、`/api/queue/cancel-all` APIを呼び出し

### バックエンド側
1. **`DELETE /api/queue/cancel-all`エンドポイントが呼ばれる**
2. **pending状態のキューを全て取得**
3. **statusを'canceled'に更新**（削除ではなく履歴として保持）
4. **error_messageに「ユーザーによりキャンセルされました」を設定**
5. **WebSocketで各キューのキャンセル通知を送信**

### データ整合性の保証
- **キャンセルされたタスクは'canceled'ステータスとして記録**
- **処理中（processing）のタスクはキャンセルされない**
- **キャンセル後も履歴として残るため、後から確認可能**

## WebSocket通信

### リアルタイム更新の仕組み
- フロントエンドとバックエンドがWebSocketで接続
- RPAからの状態更新をリアルタイムでUIに反映
- 進捗バーの自動更新

### WebSocketイベント
```javascript
// クライアント側
ws.on('queue_update', (data) => {
  // queue_id, status, error_message を受信
  updateProgressBar(data);
});

// サーバー側（PostgreSQLトリガー経由）
NOTIFY rpa_queue_update, '{"queue_id": 123, "status": "done"}';
```

## トリガーによる自動処理

### rpa_queue_update_trigger
```sql
CREATE OR REPLACE FUNCTION handle_rpa_queue_update()
RETURNS trigger AS $$
BEGIN
    -- statusが'done'に更新されたとき
    IF NEW.status = 'done' AND OLD.status != 'done' THEN
        -- Documentsテーブルを更新
        UPDATE Documents
        SET isUploaded = true,
            uploaded_at = CURRENT_TIMESTAMP
        WHERE fileID = NEW.file_id;

        -- ファイル移動（フロント側で処理）
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
```

## エラー処理

### 一般的なエラーパターン
1. **ファイルが見つからない**: Documents.passのパスにファイルが存在しない
2. **権限エラー**: ファイルへのアクセス権限がない
3. **ネットワークエラー**: モバカルネットへの接続失敗
4. **タイムアウト**: PAD処理が規定時間内に完了しない

### エラー時の処理
- rpa_queue.statusを'failed'に更新
- error_messageに詳細なエラー内容を記録
- WebSocketでフロントエンドに通知
- ユーザーにエラーダイアログを表示