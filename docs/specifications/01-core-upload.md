# 基本アップロード機能仕様書

## 概要
PADと連動して、書類を電子カルテ（モバカルネット）に自動アップロードする中核機能。**v4.1.0よりready_to_printステータス機能による印刷ワークフロー管理を実装**。

## 処理フロー（v4.1.0更新）

### Webアプリ側の処理
1. フロントから"All Upload"のリクエストを受け取る
2. DBを走査してisUploaded=falseの書類をリストアップ
3. 未アップロード書類の一覧（patientid, category, patientname, filename, pass, fileid）をUIに表示
4. ユーザーが確認してOKを押す
5. 各ファイルごとにrpa_queueテーブルにタスクを登録（status='pending'）

### 新ステータスフロー（v4.1.0）
```
旧: pending → processing → done
新: pending → processing → uploaded → ready_to_print → done
```

### PAD側の処理フロー
1. **pending → processing**: PADがタスクを取得して処理開始
2. **processing → uploaded**: モバカルネットへのアップロード完了
3. **uploaded → ready_to_print**: トリガーによる自動ファイル移動後
4. **ready_to_print → done**: 印刷完了後の手動更新

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

## ドキュメント削除機能（v3.2.0追加）

### 概要
フロントエンドから個別のドキュメントを安全に削除する機能。データベース、ファイルシステム、関連するRPAキューから完全に削除。

### 削除フロー
1. **ユーザー操作**
   - ドキュメント一覧の各行に表示される削除ボタン（ゴミ箱アイコン）をクリック
   - 確認ダイアログ「このファイルを削除してもよろしいですか？」が表示
   - 「※この操作は取り消せません」の警告メッセージ付き

2. **バックエンド処理**
   - 処理中（`processing`）のRPAキューがある場合は削除を拒否
   - トランザクション内でDocumentsテーブルから削除
   - CASCADE DELETEによりrpa_queueの関連エントリも自動削除
   - ファイルシステムから物理ファイルを削除（uploaded/フォルダも対応）

3. **リアルタイム更新**
   - WebSocket経由で`document_deleted`イベントを全クライアントに配信
   - 他のブラウザでも即座に一覧から削除される
   - 統計情報（pending_count、uploaded_count等）も自動更新

### APIエンドポイント
- **DELETE** `/api/documents/:id` - ドキュメント削除

### エラーハンドリング
- **409 Conflict**: 処理中のドキュメントは削除不可
- **404 Not Found**: 指定されたドキュメントが存在しない
- **500 Internal Server Error**: データベースエラー等

### セキュリティ考慮事項
- SQLインジェクション対策（パラメータ化クエリ使用）
- パストラバーサル攻撃対策（ファイルパス検証）
- トランザクション処理によるデータ整合性保証

## ドキュメント削除機能 (v3.5.0)

### 概要
ドキュメントレコードと物理ファイルの削除を安全に実行する機能。患者別表示とキューモニター画面から削除が可能。

### 削除対象と制約
- **対象**: Documentsテーブルのレコードと対応する物理ファイル
- **制約**: `rpa_queue`で`processing`状態のドキュメントは削除不可（409 Conflictエラー）
- **安全性**: 削除前に確認ダイアログを表示

### API仕様
```http
DELETE /api/documents/:id
```

**レスポンス例**:
```json
{
  "success": true,
  "message": "Document deleted successfully",
  "data": {
    "file_id": 15,
    "file_name": "report.pdf"
  }
}
```

**エラーレスポンス**:
```json
{
  "success": false,
  "error": "Cannot delete processing document",
  "message": "このドキュメントは現在処理中のため削除できません。",
  "status": 409
}
```

### 削除フロー
1. **処理中チェック**: `rpa_queue`で該当ファイルの`processing`状態を確認
2. **処理中の場合**: 409エラーを返して削除を拒否
3. **削除可能な場合**:
   - Documentsテーブルから削除（CASCADE DELETEでrpa_queueも自動削除）
   - 物理ファイルを削除（ファイルが存在しない場合はスキップ）
   - WebSocket通知で`document_deleted`イベントを送信

### UI配置
- **患者別表示**: 各ドキュメントアイテムに削除ボタン（🗑️）
- **書類別表示**: 各ドキュメントアイテムに削除ボタン（🗑️）
- **確認ダイアログ**: 削除対象の詳細情報と取り消し不可の警告を表示

## キュータスク削除機能 (v3.5.0)

### 概要
`rpa_queue`テーブルからタスクを個別削除する機能。Documentsテーブルは変更せず、キューからの除去のみ実行。

### 削除対象
- **対象**: `rpa_queue`テーブルの特定レコード
- **保護対象**: Documentsテーブル（変更されない）
- **用途**: 不要なキュータスクの削除、スタックしたタスクの解消

### API仕様
```http
DELETE /api/queue/:id
```

**レスポンス例**:
```json
{
  "success": true,
  "message": "キューアイテムを削除しました",
  "data": {
    "queue_id": 25,
    "file_id": 15,
    "patient_id": 99999998,
    "previous_status": "processing"
  }
}
```

### 削除フロー
1. **存在確認**: 指定されたキューIDの存在を確認
2. **削除実行**: `rpa_queue`テーブルから該当レコードを削除
3. **通知送信**: WebSocketで`queue_deleted`イベントを送信
4. **UI更新**: キューモニター画面を自動更新

### UI配置
- **キューモニター**: 各キューアイテムに削除ボタン（🗑️）
- **確認ダイアログ**: キューID、ファイル名、患者名と「ファイルは削除されません」の説明を表示
- **ready_to_printステータス表示**: キューモニターで印刷待ち状態を視覚的に表示

### z-index管理
モーダルの重なり順序を適切に管理：
- **基本モーダル** (キューモニター等): `z-index: 1000`
- **確認ダイアログ**: `z-index: 1100`
- **トーストメッセージ**: `z-index: 2000`

## ready_to_printステータス機能（v4.1.0新機能）

### 概要
印刷ワークフローを管理するための新しいステータス。アップロード完了後、印刷準備が完了した状態を表す。

### 自動遷移フロー
1. **PADアップロード完了**: status = 'uploaded'
2. **トリガー発動**: auto_update_document_on_ready_to_print()
3. **Documents更新**: isUploaded=true, uploaded_at設定
4. **ファイル移動通知**: pg_notify('file_movement_required')
5. **自動ステータス更新**: status = 'ready_to_print'

### API エンドポイント
```http
# PAD用（アップロード完了）
PUT /api/queue/:id/uploaded

# 印刷準備完了（自動）
PUT /api/queue/:id/ready-to-print

# 印刷完了（手動）
PUT /api/queue/:id/done
```

### フロントエンド表示
- **アイコン**: 🖨️ (プリンター)
- **ラベル**: "印刷待ち"
- **色**: #ffc107 (黄色)
- **背景色**: rgba(255, 193, 7, 0.1)
- **CSSクラス**: .queue-row--print-ready

### 処理タイミング
1. PADがモバカルネットへのアップロード完了
2. `/api/queue/:id/uploaded` を呼び出し
3. トリガーが自動実行され、ファイル移動とDB更新
4. 自動的に 'ready_to_print' ステータスに遷移
5. フロントエンドで印刷待ち状態を表示
6. 印刷完了後、手動で 'done' に更新

### 互換性情報
- 既存の `/api/queue/:id/complete` は `/uploaded` にリダイレクト
- 既存の 'done' ステータスのレコードは自動的に 'uploaded' に移行される