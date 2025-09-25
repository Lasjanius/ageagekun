# アゲアゲくん ローカルネットワーク構成ガイド

## 概要
このガイドでは、アゲアゲくんシステムを同一WiFiネットワーク内の複数PCから利用できるようにするための設定手順を説明します。

## 前提条件
- Windows PC（サーバー用）1台
- PostgreSQL 17がインストール済み
- Node.js/npmがインストール済み
- 同一WiFiネットワーク内のクライアントPC

## ネットワーク構成図
```
[WiFiルーター]
     |
     +--- [サーバーPC] 192.168.0.10（例）
     |        ├─ PostgreSQL (5432)
     |        ├─ Node.js Backend (3000)
     |        └─ Frontend (3000経由で配信)
     |
     +--- [クライアントPC-1] 192.168.0.20
     +--- [クライアントPC-2] 192.168.0.21
     └--- [クライアントPC-3] 192.168.0.22
```

## 設定手順

### 1. サーバーPCのIPアドレス固定化

#### 方法A: ルーター側でDHCP予約
1. ルーターの管理画面にアクセス
2. DHCP設定でサーバーPCのMACアドレスに固定IPを割り当て
3. 例：192.168.0.10を予約

#### 方法B: Windows側で固定IP設定
1. ネットワークアダプタの設定を開く
2. IPv4プロパティで以下を設定：
   - IPアドレス: 192.168.0.10
   - サブネットマスク: 255.255.255.0
   - デフォルトゲートウェイ: 192.168.0.1（ルーターのIP）
   - DNS: 192.168.0.1

### 2. PostgreSQL設定

#### postgresql.conf の編集
場所: `C:\Program Files\PostgreSQL\17\data\postgresql.conf`

```conf
# 変更前
#listen_addresses = 'localhost'

# 変更後（全てのネットワークインターフェースで受信）
listen_addresses = '*'

# またはセキュリティを考慮して特定IPのみ
# listen_addresses = 'localhost,192.168.0.10'
```

#### pg_hba.conf の編集
場所: `C:\Program Files\PostgreSQL\17\data\pg_hba.conf`

ファイルの最後に以下を追加：
```conf
# ローカルネットワークからの接続を許可
# TYPE  DATABASE        USER            ADDRESS                 METHOD
host    ageagekun       postgres        192.168.0.0/24         scram-sha-256
host    ageagekun       all             192.168.0.0/24         scram-sha-256
```

#### PostgreSQLサービスの再起動
```powershell
# 管理者権限のPowerShellで実行
Restart-Service -Name "postgresql-x64-17"
```

### 3. Node.js/Express設定

#### backend/server.js の修正
```javascript
// 変更前
server.listen(PORT, async () => {

// 変更後（全てのネットワークインターフェースで受信）
server.listen(PORT, '0.0.0.0', async () => {
```

#### backend/.env の設定

サーバーPC用 (.env):
```env
# Database Configuration
DB_HOST=localhost  # サーバー自身はlocalhostのまま
DB_PORT=5432
DB_NAME=ageagekun
DB_USER=postgres
DB_PASSWORD=rad1ohead

# Server Configuration
PORT=3000
NODE_ENV=production
HOST=0.0.0.0

# CORS Configuration（複数のオリジンを許可）
CORS_ORIGIN=*  # 開発時のみ。本番では具体的なIPを指定
```

クライアントPC用の設定ファイル (.env.client):
```env
# API設定
API_BASE_URL=http://192.168.0.10:3000
```

#### backend/server.js のCORS設定強化（オプション）
```javascript
// 複数のオリジンを許可する場合
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://192.168.0.10:3000',
      'http://192.168.0.10:3001',
      // 必要に応じてクライアントPCのIPも追加
    ];

    // originがundefined（同一オリジン）または許可リストに含まれる場合は許可
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
};

app.use(cors(corsOptions));
```

### 4. フロントエンド設定

#### API接続先の環境変数化
frontend/js/config.js を作成：
```javascript
// 環境に応じてAPIのベースURLを切り替え
const API_BASE_URL = (() => {
  // サーバーPCで実行している場合
  if (window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1') {
    return 'http://localhost:3000';
  }
  // ネットワーク経由でアクセスしている場合
  return `http://${window.location.hostname}:3000`;
})();

// エクスポート
window.API_CONFIG = {
  BASE_URL: API_BASE_URL,
  WS_URL: API_BASE_URL.replace('http', 'ws')
};
```

各JavaScriptファイルでの使用例：
```javascript
// 変更前
fetch('http://localhost:3000/api/patients/all')

// 変更後
fetch(`${window.API_CONFIG.BASE_URL}/api/patients/all`)
```

### 5. Windowsファイアウォール設定

#### PowerShell（管理者権限）で実行：

```powershell
# PostgreSQL用の受信規則を追加
New-NetFirewallRule -DisplayName "PostgreSQL (ageagekun)" `
  -Direction Inbound -Protocol TCP -LocalPort 5432 `
  -Action Allow -Profile Private `
  -RemoteAddress 192.168.0.0/24

# Node.js用の受信規則を追加
New-NetFirewallRule -DisplayName "Node.js Backend (ageagekun)" `
  -Direction Inbound -Protocol TCP -LocalPort 3000 `
  -Action Allow -Profile Private `
  -RemoteAddress 192.168.0.0/24

# 規則の確認
Get-NetFirewallRule -DisplayName "*ageagekun*" |
  Format-Table DisplayName, Enabled, Action, Direction, Protocol
```

### 6. サービスの起動

#### サーバーPC上で実行：
```bash
# backend ディレクトリで
cd C:\Users\hyosh\Desktop\allright\ageagekun\backend
npm start

# または開発モード
npm run dev
```

### 7. クライアントPCからのアクセス

ブラウザで以下のURLにアクセス：
```
http://192.168.0.10:3000
```

## セキュリティに関する重要事項

### 必須対策
1. **PostgreSQLユーザーパスワード**: 強固なパスワードを設定
2. **最小権限の原則**: 必要最小限のデータベース権限のみ付与
3. **ネットワーク分離**: 医療情報を扱うため、専用VLANの検討を推奨
4. **定期的な更新**: OS、PostgreSQL、Node.jsを最新版に保つ

### 推奨対策
1. **HTTPS化**: 自己署名証明書でもよいのでHTTPS通信を実装
2. **認証機能**: ユーザー認証・認可機能の実装
3. **ログ記録**: アクセスログ、エラーログの記録と定期監査
4. **バックアップ**: データベースの定期バックアップ（暗号化推奨）

## トラブルシューティング

### PostgreSQL接続エラー
```bash
# サーバーPCで接続テスト
"C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h 192.168.0.10 -d ageagekun -w

# エラーメッセージを確認してpg_hba.confを調整
```

### Node.js接続エラー
```bash
# ポートが使用中か確認
netstat -an | findstr :3000

# プロセスを確認
tasklist | findstr node
```

### ファイアウォール確認
```powershell
# 規則の状態確認
Get-NetFirewallRule -DisplayName "*ageagekun*" |
  Select DisplayName, Enabled, Action

# 一時的に無効化してテスト（テスト後は必ず有効化）
Disable-NetFirewallRule -DisplayName "PostgreSQL (ageagekun)"
Enable-NetFirewallRule -DisplayName "PostgreSQL (ageagekun)"
```

## 運用上の注意点

1. **サーバーPCの電源管理**: スリープ無効化、自動起動設定
2. **定期メンテナンス**: PostgreSQLのVACUUM、インデックス再構築
3. **監視**: リソース使用状況（CPU、メモリ、ディスク）の定期確認
4. **ドキュメント管理**: 設定変更時は必ず記録を残す

## 開発環境から運用環境へのデータベース移行

### 移行概要
開発PCで構築したデータベースを運用PCに移行する手順です。

### 前提条件
- 両方のPCにPostgreSQL 17がインストール済み
- GitHubからソースコードをクローン済み
- 運用PCに必要なNode.js環境がセットアップ済み

### 移行手順

#### 1. 開発PCでデータベースをエクスポート

##### 方法A: pg_dumpを使用（推奨）
```powershell
# カスタム形式でバックアップ（推奨：圧縮され、リストア時に柔軟）
"C:\Program Files\PostgreSQL\17\bin\pg_dump.exe" -U postgres -h localhost -d ageagekun -F c -b -v -f ageagekun_backup.dump

# SQL形式でバックアップ（可読性重視）
"C:\Program Files\PostgreSQL\17\bin\pg_dump.exe" -U postgres -h localhost -d ageagekun -f ageagekun_backup.sql

# タイムスタンプ付きバックアップ
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
"C:\Program Files\PostgreSQL\17\bin\pg_dump.exe" -U postgres -h localhost -d ageagekun -F c -b -v -f "ageagekun_backup_$timestamp.dump"
```

##### 方法B: スキーマとデータを分けてエクスポート
```powershell
# テーブル構造のみ
"C:\Program Files\PostgreSQL\17\bin\pg_dump.exe" -U postgres -h localhost -d ageagekun --schema-only -f schema.sql

# データのみ
"C:\Program Files\PostgreSQL\17\bin\pg_dump.exe" -U postgres -h localhost -d ageagekun --data-only -f data.sql
```

#### 2. ファイルシステムのバックアップ

```powershell
# 患者ファイルとバッチ印刷ファイルをバックアップ
$backupDir = "ageagekun_files_backup_$(Get-Date -Format 'yyyyMMdd')"
New-Item -ItemType Directory -Path $backupDir

# patientsフォルダをコピー
Copy-Item -Path "C:\Users\hyosh\Desktop\allright\ageagekun\patients" -Destination "$backupDir\patients" -Recurse

# batch_printsフォルダをコピー（存在する場合）
if (Test-Path "C:\Users\hyosh\Desktop\allright\ageagekun\batch_prints") {
    Copy-Item -Path "C:\Users\hyosh\Desktop\allright\ageagekun\batch_prints" -Destination "$backupDir\batch_prints" -Recurse
}

Write-Host "✅ ファイルバックアップ完了: $backupDir"
```

#### 3. 運用PCでデータベースをインポート

##### 初期セットアップ
```powershell
# 1. データベースを作成
"C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h localhost -w -c "CREATE DATABASE ageagekun;"

# 2. 必要な拡張機能をインストール（必要に応じて）
"C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h localhost -d ageagekun -w -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
```

##### データのリストア
```powershell
# カスタム形式からリストア
"C:\Program Files\PostgreSQL\17\bin\pg_restore.exe" -U postgres -h localhost -d ageagekun -v ageagekun_backup.dump

# SQL形式からリストア
"C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h localhost -d ageagekun -f ageagekun_backup.sql

# スキーマとデータを分けてリストア
"C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h localhost -d ageagekun -f schema.sql
"C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h localhost -d ageagekun -f data.sql
```

#### 4. ファイルシステムの復元

```powershell
# 運用PCの適切な場所にファイルをコピー
Copy-Item -Path "バックアップ元\patients" -Destination "C:\Users\[ユーザー名]\Desktop\allright\ageagekun\patients" -Recurse
Copy-Item -Path "バックアップ元\batch_prints" -Destination "C:\Users\[ユーザー名]\Desktop\allright\ageagekun\batch_prints" -Recurse
```

#### 5. 環境設定ファイルの調整

##### backend/.env ファイルの作成
```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ageagekun
DB_USER=postgres
DB_PASSWORD=rad1ohead  # 運用環境用のパスワードに変更

# Server Configuration
PORT=3000
NODE_ENV=production
HOST=0.0.0.0

# CORS Configuration
CORS_ORIGIN=*  # 本番環境では具体的なIPアドレスを指定

# Azure OpenAI Configuration（必要に応じて）
AI_PROVIDER=azure
AZURE_OPENAI_API_KEY=your_api_key
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4o-mini
```

##### pgpass.conf の設定
```powershell
# C:\Users\[ユーザー名]\AppData\Roaming\postgresql\pgpass.conf
echo "localhost:5432:*:postgres:rad1ohead" > "$env:APPDATA\postgresql\pgpass.conf"
```

### 移行後の確認

#### データベース接続テスト
```powershell
# PostgreSQL接続確認
"C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h localhost -d ageagekun -w -c "\dt"
```

#### データ整合性確認
```sql
-- 各テーブルのレコード数を確認
SELECT 'patients' as table_name, COUNT(*) as count FROM patients
UNION ALL
SELECT 'documents', COUNT(*) FROM documents
UNION ALL
SELECT 'rpa_queue', COUNT(*) FROM rpa_queue
UNION ALL
SELECT 'care_offices', COUNT(*) FROM care_offices
UNION ALL
SELECT 'care_managers', COUNT(*) FROM care_managers
UNION ALL
SELECT 'visiting_nurse_stations', COUNT(*) FROM visiting_nurse_stations
UNION ALL
SELECT 'batch_prints', COUNT(*) FROM batch_prints;
```

#### アプリケーション起動確認
```powershell
# バックエンドサーバー起動
cd C:\Users\[ユーザー名]\Desktop\allright\ageagekun\backend
npm install  # 初回のみ
npm start

# ブラウザでアクセス
start http://localhost:3000
```

### 移行スクリプト（自動化）

`migrate_to_production.ps1` として保存：
```powershell
param(
    [Parameter(Mandatory=$true)]
    [string]$TargetPC,  # 運用PCのIPアドレスまたはホスト名

    [Parameter(Mandatory=$false)]
    [string]$BackupDir = ".\migration_backup"
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  アゲアゲくん データベース移行ツール  " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# バックアップディレクトリ作成
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupPath = "$BackupDir\$timestamp"
New-Item -ItemType Directory -Path $backupPath -Force

# データベースバックアップ
Write-Host "`n📦 データベースをバックアップ中..." -ForegroundColor Yellow
& "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe" `
    -U postgres -h localhost -d ageagekun `
    -F c -b -v -f "$backupPath\ageagekun.dump"

# ファイルシステムバックアップ
Write-Host "`n📁 ファイルをバックアップ中..." -ForegroundColor Yellow
Copy-Item -Path ".\patients" -Destination "$backupPath\patients" -Recurse
Copy-Item -Path ".\batch_prints" -Destination "$backupPath\batch_prints" -Recurse -ErrorAction SilentlyContinue

# 設定ファイルテンプレート作成
Write-Host "`n⚙️ 設定ファイルテンプレートを作成中..." -ForegroundColor Yellow
@"
# 運用環境用 .env ファイル
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ageagekun
DB_USER=postgres
DB_PASSWORD=YOUR_PASSWORD_HERE

PORT=3000
NODE_ENV=production
HOST=0.0.0.0
CORS_ORIGIN=http://$TargetPC:3000
"@ | Out-File -FilePath "$backupPath\.env.production" -Encoding UTF8

# リストア手順書作成
Write-Host "`n📝 リストア手順書を作成中..." -ForegroundColor Yellow
@"
運用PCでの復元手順:

1. データベース作成:
   psql -U postgres -c "CREATE DATABASE ageagekun;"

2. データベースリストア:
   pg_restore -U postgres -d ageagekun -v ageagekun.dump

3. ファイル復元:
   Copy-Item -Path "patients" -Destination "C:\...\ageagekun\patients" -Recurse
   Copy-Item -Path "batch_prints" -Destination "C:\...\ageagekun\batch_prints" -Recurse

4. 環境設定:
   .env.productionを.envにリネームしてパスワードを設定

5. アプリケーション起動:
   cd backend && npm install && npm start
"@ | Out-File -FilePath "$backupPath\RESTORE_INSTRUCTIONS.txt" -Encoding UTF8

Write-Host "`n✅ 移行準備完了！" -ForegroundColor Green
Write-Host "バックアップ場所: $backupPath" -ForegroundColor White
Write-Host "このフォルダを運用PCにコピーして、RESTORE_INSTRUCTIONS.txtの手順に従ってください。" -ForegroundColor White
```

### トラブルシューティング

#### よくある問題と解決策

1. **文字コードエラー**
   ```powershell
   # UTF-8でエクスポート/インポート
   $env:PGCLIENTENCODING = "UTF8"
   pg_dump ...
   ```

2. **権限エラー**
   ```sql
   -- ユーザー権限の付与
   GRANT ALL PRIVILEGES ON DATABASE ageagekun TO postgres;
   GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres;
   ```

3. **パスの不整合**
   ```sql
   -- Documentsテーブルのパスを更新
   UPDATE documents
   SET base_dir = REPLACE(base_dir, 'hyosh', '新ユーザー名')
   WHERE base_dir LIKE '%hyosh%';
   ```

### 移行チェックリスト

- [ ] PostgreSQL 17のバージョン確認
- [ ] データベースバックアップ作成
- [ ] patientsフォルダのバックアップ
- [ ] batch_printsフォルダのバックアップ
- [ ] 運用PCへのファイル転送
- [ ] データベースリストア
- [ ] ファイルシステム復元
- [ ] .env設定
- [ ] pgpass.conf設定
- [ ] ネットワーク設定（必要に応じて）
- [ ] アプリケーション起動確認
- [ ] データ整合性確認
- [ ] 全機能の動作テスト

## 次のステップ

### 高度な設定（オプション）
1. **リバースプロキシ導入**: Nginx/IISでポート統合
2. **PM2導入**: Node.jsプロセス管理とWindowsサービス化
3. **監視ツール**: Grafana/Prometheusでシステム監視
4. **CI/CD**: 自動デプロイメントパイプライン構築

## 参考リンク
- [PostgreSQL公式ドキュメント - 接続設定](https://www.postgresql.jp/docs/17/runtime-config-connection.html)
- [Node.js公式ドキュメント](https://nodejs.org/docs/)
- [Express.js セキュリティベストプラクティス](https://expressjs.com/en/advanced/best-practice-security.html)