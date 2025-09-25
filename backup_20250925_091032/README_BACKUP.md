# アゲアゲくん バックアップ情報

## バックアップ日時
2025年9月25日 09:10

## バックアップ内容

### 1. データベース
- **ファイル**: `ageagekun.dump`
- **形式**: PostgreSQL カスタムダンプ形式（pg_dump -F c）
- **サイズ**: 約8.7 MB
- **テーブル情報**:
  - patients: 7件
  - documents: 17件
  - rpa_queue: 18件
  - batch_prints: 4件

### 2. ファイルシステム
- **フォルダ**: `patients/`
- **内容**: 患者ごとのPDFファイルと管理ファイル
- **サイズ**: 約3.6 MB

### 3. 環境設定ファイル
- `.env.backend` - バックエンド設定（データベース接続情報含む）
- `.env.local` - Azure OpenAI API設定

## リストア手順

### 運用PCでの作業

#### 1. 必要なソフトウェアのインストール
- PostgreSQL 17
- Node.js LTS版
- Git for Windows

#### 2. データベースのリストア
```powershell
# データベース作成
"C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h localhost -w -c "CREATE DATABASE ageagekun;"

# データリストア
"C:\Program Files\PostgreSQL\17\bin\pg_restore.exe" -U postgres -h localhost -d ageagekun -v "path\to\backup_20250925_091032\ageagekun.dump"
```

#### 3. ファイルシステムの復元
```powershell
# patientsフォルダをコピー
Copy-Item -Path "path\to\backup_20250925_091032\patients" -Destination "C:\Users\[ユーザー名]\Desktop\allright\ageagekun\patients" -Recurse
```

#### 4. 環境設定の適用
- `.env.backend`を`backend\.env`にコピー
- `.env.local`の内容を確認し、必要な設定を適用

## 重要な注意事項

### セキュリティ情報
- **PostgreSQLパスワード**: rad1ohead（.env.backendに記載）
- **Azure OpenAI APIキー**: .env.localに記載（要セキュア管理）

### パスの修正が必要な場合
Documentsテーブルのパスにユーザー名（hyosh）が含まれている場合：
```sql
UPDATE documents
SET base_dir = REPLACE(base_dir, 'hyosh', '新ユーザー名')
WHERE base_dir LIKE '%hyosh%';
```

## GitHub情報
ソースコードはGitHubから取得してください。
リポジトリURLとアクセス権限は別途確認が必要です。

## 連絡先
問題が発生した場合は、このバックアップファイルと共にエラーログを保管してください。