# API仕様書

## 概要
RESTful APIとWebSocketによるリアルタイム通信を提供。Node.js + Express.jsで実装。

## ベースURL
```
http://localhost:3000
```

## 共通仕様

### レスポンス形式
```json
{
  "success": true,
  "data": { ... },
  "message": "Success message"
}
```

### エラーレスポンス
```json
{
  "success": false,
  "error": "Error message",
  "details": { ... }
}
```

### 認証
現在は認証なし（将来的にJWT実装予定）

## エンドポイント一覧

### 文書管理API

#### GET /api/documents/pending-uploads
未アップロード書類の一覧取得

**レスポンス**:
```json
{
  "success": true,
  "count": 5,
  "documents": [
    {
      "fileID": 1,
      "fileName": "居宅レポート.pdf",
      "patientID": 99999999,
      "patientName": "田中太郎",
      "Category": "居宅",
      "FileType": "pdf",
      "pass": "C:\\...\\99999999\\居宅レポート.pdf",
      "base_dir": "C:\\...\\99999999"
    }
  ]
}
```

#### GET /api/documents/all
全ドキュメント一覧（ページネーション対応）

**クエリパラメータ**:
- `page`: ページ番号（デフォルト: 1）
- `limit`: 1ページあたりの件数（デフォルト: 20）
- `status`: uploaded/pending でフィルタ

### 患者管理API

#### GET /api/patients/all
全患者一覧取得

**レスポンス**:
```json
{
  "success": true,
  "patients": [
    {
      "patientid": 99999999,
      "patientname": "田中太郎",
      "address": "東京都...",
      "birthdate": "1945-03-15",
      "cm_name": "山田花子",
      "office_name": "ケアプランセンターA",
      "office_address": "東京都千代田区...",
      "vns_name": "訪問看護ステーション東京"
    }
  ]
}
```

#### GET /api/patients/:id
特定患者の詳細情報取得

**パラメータ**:
- `id`: 患者ID（8桁）

#### GET /api/patients/:id/report-data
報告書用データ取得（整形済み）

### AI報告書API

#### POST /api/ai/generate-kyotaku-report
居宅療養管理指導報告書のAI生成

**リクエスト**:
```json
{
  "patient_id": "99999999",
  "karte_content": "診察内容のテキスト..."
}
```

**レスポンス**:
```json
{
  "success": true,
  "data": {
    "care_level": "要介護3",
    "primary_disease": "糖尿病",
    "exam_date": "2025/1/18",
    "next_exam_date": "2025/2/18",
    "medical_content": "診療内容の要約（3-8行）",
    "selected_advice": "diabetes",
    "advice_text": "糖尿病生活指導：間食を控えるように..."
  }
}
```

#### GET /api/ai/status
AI APIキーの状態確認

### RPA処理キューAPI

#### POST /api/queue/create-batch
バッチアップロード用キュー作成

**リクエスト**:
```json
{
  "files": [
    {
      "fileId": 1,
      "fileName": "居宅レポート.pdf",
      "patientId": 99999999,
      "category": "居宅",
      "pass": "C:\\...\\居宅レポート.pdf"
    }
  ]
}
```

**レスポンス**:
```json
{
  "success": true,
  "message": "5件のキューを作成しました",
  "queues": [
    {
      "id": 123,
      "file_id": 1,
      "status": "pending"
    }
  ]
}
```

#### GET /api/queue/:id/status
キューステータス確認

#### PUT /api/queue/:id/processing
ステータスを処理中に更新（PAD用）

#### PUT /api/queue/:id/complete
ステータスを完了に更新（PAD用）

#### PUT /api/queue/:id/failed
ステータスを失敗に更新（PAD用）

**リクエスト**:
```json
{
  "error_message": "ファイルが見つかりません"
}
```

#### DELETE /api/queue/cancel-all
全ペンディングキューをキャンセル

### ファイルサービスAPI

#### GET /api/files/:fileId
PDFファイルの取得（ダウンロード/表示）

**レスポンス**: PDFバイナリデータ

#### GET /api/files/:fileId/info
ファイル情報の取得

### システム管理API

#### GET /api/health
ヘルスチェック

**レスポンス**:
```json
{
  "status": "OK",
  "service": "ageagekun-backend",
  "timestamp": "2025-01-18T10:00:00.000Z",
  "database": "connected",
  "websocket": "active"
}
```

## WebSocket通信

### 接続
```javascript
const ws = new WebSocket('ws://localhost:3000');
```

### イベント

#### queue_update
キューステータス更新通知
```json
{
  "type": "queue_update",
  "data": {
    "queue_id": 123,
    "status": "done",
    "file_id": 1
  }
}
```

#### upload_progress
アップロード進捗更新
```json
{
  "type": "upload_progress",
  "data": {
    "total": 10,
    "completed": 5,
    "percentage": 50
  }
}
```

#### error
エラー通知
```json
{
  "type": "error",
  "data": {
    "message": "エラーメッセージ",
    "queue_id": 123
  }
}
```

## エラーコード

### HTTPステータスコード
- `200`: 成功
- `400`: リクエスト不正
- `404`: リソース不在
- `500`: サーバーエラー

### アプリケーションエラーコード
- `E001`: データベース接続エラー
- `E002`: ファイル不在
- `E003`: 権限不足
- `E004`: AI API エラー
- `E005`: キュー処理エラー

## レート制限
- 通常API: 100リクエスト/分
- AI API: 10リクエスト/分
- ファイルアップロード: 50MB/ファイル

## CORS設定
```javascript
{
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}
```