# RPA Queue ステータス拡張 - 実装手順書

## 📋 概要
RPAキューに新しいステータス（`uploaded`, `ready_to_print`）を追加し、アップロード完了と印刷完了を明確に分離します。

## 🎯 変更内容

### 新しいステータスフロー
```
旧: pending → processing → done → (終了)
新: pending → processing → uploaded → ready_to_print → done
```

### 主な変更点
- ✅ アップロード完了時は `uploaded` ステータス
- ✅ 印刷待機中は `ready_to_print` ステータス
- ✅ 全処理完了で `done` ステータス
- ✅ 既存の `done` レコードは `uploaded` に移行

## 🚀 実装手順

### 前提条件
- PostgreSQL 17がインストール済み
- Node.js環境がセットアップ済み
- 管理者権限でコマンドを実行可能

### Step 1: 事前バックアップ（推奨）
```bash
# データベースのバックアップ
"C:\Program Files\PostgreSQL\17\bin\pg_dump.exe" -U postgres -h localhost -d ageagekun -w > backup_before_status_change.sql
```

### Step 2: データベース更新
```bash
# 移行スクリプトの実行
"C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h localhost -d ageagekun -w -f migrations\add_new_status_values.sql

# 検証
"C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h localhost -d ageagekun -w -f migrations\verify_status_migration.sql
```

### Step 3: サーバー再起動
```bash
# バックエンドサーバーを停止（Ctrl+C）して再起動
cd backend
npm start
```

### Step 4: 動作確認
```powershell
# PowerShellで新しいステータスフローをテスト
.\test_new_status_flow.ps1 -ShowStatus  # 現在のステータス確認
.\test_new_status_flow.ps1 -FileId 5 -Reset  # テストデータ準備
.\test_new_status_flow.ps1 -FileId 5  # ステータス遷移テスト
```

## 🔄 PAD（Power Automate Desktop）の更新

### 変更が必要な箇所
PADスクリプトでアップロード完了時のAPI呼び出しを変更：

**変更前:**
```
PUT http://localhost:3000/api/queue/{id}/complete
```

**変更後:**
```
PUT http://localhost:3000/api/queue/{id}/uploaded
```

## 📊 新しいAPIエンドポイント

| エンドポイント | 説明 | 遷移 |
|--------------|------|------|
| `PUT /api/queue/:id/processing` | 処理開始 | pending → processing |
| `PUT /api/queue/:id/uploaded` | アップロード完了（PAD用） | processing → uploaded |
| `PUT /api/queue/:id/ready-to-print` | 印刷準備完了 | uploaded → ready_to_print |
| `PUT /api/queue/:id/done` | 印刷完了 | ready_to_print → done |
| `PUT /api/queue/:id/failed` | エラー | any → failed |

### 後方互換性
- `PUT /api/queue/:id/complete` は `uploaded` にリダイレクト（非推奨）

## 🎨 フロントエンドの変更

### 新しいステータス表示
| ステータス | ラベル | アイコン | 色 |
|-----------|--------|---------|-----|
| pending | 処理待ち | ⏳ | グレー |
| processing | 処理中 | 🔄 | 青（アニメーション付き） |
| uploaded | アップロード完了 | ☁️ | 水色 |
| ready_to_print | 印刷待ち | 🖨️ | 黄色 |
| done | 完了 | ✅ | 緑 |
| failed | エラー | ❌ | 赤 |

## 🔍 トラブルシューティング

### Q: 移行後に既存データが表示されない
```sql
-- ステータス分布を確認
SELECT status, COUNT(*) FROM rpa_queue GROUP BY status;
```

### Q: トリガーが動作しない
```sql
-- トリガー一覧を確認
SELECT trigger_name FROM information_schema.triggers
WHERE event_object_table = 'rpa_queue';
```

### Q: ロールバックしたい場合
```bash
# ロールバックスクリプトの実行
"C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h localhost -d ageagekun -w -f migrations\rollback_status_values.sql
```

## 📝 変更ファイル一覧

### 新規作成
- `migrations/add_new_status_values.sql` - DB移行スクリプト
- `migrations/rollback_status_values.sql` - ロールバックスクリプト
- `migrations/verify_status_migration.sql` - 検証クエリ
- `frontend/js/constants.js` - ステータス定義
- `test_new_status_flow.ps1` - テストスクリプト

### 更新
- `backend/controllers/queueController.js` - 新しいAPI実装
- `backend/routes/queue.js` - ルーティング更新
- `frontend/js/app.js` - ステータス判定ロジック
- `frontend/js/ui.js` - UI表示更新
- `frontend/css/styles.css` - スタイル追加
- `frontend/index.html` - constants.js追加

## ✅ チェックリスト

実装前:
- [ ] データベースバックアップ取得
- [ ] 現在のステータス分布確認

実装:
- [ ] データベース移行スクリプト実行
- [ ] サーバー再起動
- [ ] フロントエンド動作確認
- [ ] APIエンドポイント動作確認

実装後:
- [ ] 新しいステータスフローのテスト
- [ ] PADとの連携確認
- [ ] エラーがないことを確認

## 📞 サポート

問題が発生した場合は、以下の情報と共に報告してください：
1. エラーメッセージ
2. `verify_status_migration.sql` の実行結果
3. サーバーログ

---

最終更新: 2025-09-21
バージョン: 1.0.0