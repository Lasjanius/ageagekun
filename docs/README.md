# アゲアゲくん ドキュメント一覧

## 概要
このディレクトリには、アゲアゲくんシステムの運用・保守・移行に関するドキュメントが格納されています。

## ドキュメント構成

### 📚 主要ドキュメント

#### 1. [PRD.md](./PRD.md)
- **内容**: プロダクト要求仕様書（マスターインデックス）
- **用途**: システム全体の機能仕様を確認する際の起点

#### 2. [migration_guide.md](./migration_guide.md)
- **内容**: 開発環境から運用環境への完全移行ガイド
- **用途**: 環境移行作業を実施する際の手順書
- **関連**: [local_network_setup_guide.md](./local_network_setup_guide.md)

#### 3. [local_network_setup_guide.md](./local_network_setup_guide.md)
- **内容**: ローカルネットワーク構成とマルチPC対応設定
- **用途**: 複数PCから利用可能にする際の設定手順
- **関連**: [migration_guide.md](./migration_guide.md)の「Phase 4: ネットワーク設定」

#### 4. [migration_summary_20250925.md](./migration_summary_20250925.md)
- **内容**: 2025年9月25日実施の移行作業記録
- **用途**: 実際の移行作業の記録と成果物一覧

#### 5. [inspect.md](./inspect.md)
- **内容**: UI自動化要素のドキュメント
- **用途**: RPA開発時の参照資料

## 🛠️ ユーティリティスクリプト

### バックアップ・リストア
- **[../backup_dev.ps1](../backup_dev.ps1)** - 開発環境自動バックアップスクリプト
- **[../test_production.ps1](../test_production.ps1)** - 運用環境動作確認スクリプト
- **[../test_rpa_trigger.ps1](../test_rpa_trigger.ps1)** - RPAトリガーテストスクリプト

### 環境設定テンプレート
- **[../.env.production.template](../.env.production.template)** - 運用環境用.envテンプレート

## 📋 クイックリファレンス

### 新規環境構築の流れ
1. [migration_guide.md](./migration_guide.md) - Phase 2を参照して必要なソフトウェアをインストール
2. GitHubからソースコードをクローン
3. [../.env.production.template](../.env.production.template)を`.env`にコピーして設定
4. [migration_guide.md](./migration_guide.md) - Phase 3に従ってデータをリストア
5. [local_network_setup_guide.md](./local_network_setup_guide.md)でネットワーク設定
6. [../test_production.ps1](../test_production.ps1)で動作確認

### バックアップ作成
```powershell
# 自動バックアップ
.\backup_dev.ps1

# 圧縮付きバックアップ
.\backup_dev.ps1 -Compress
```

### トラブルシューティング
- PostgreSQL接続エラー → [local_network_setup_guide.md#トラブルシューティング](./local_network_setup_guide.md#トラブルシューティング)
- ファイルパスエラー → [migration_guide.md#トラブルシューティング](./migration_guide.md#トラブルシューティング)
- RPAトリガー問題 → [../CLAUDE.md#troubleshooting](../CLAUDE.md#troubleshooting)

## 更新履歴
- 2025/09/25: 初回移行作業実施、全ドキュメント作成
- 2025/09/25: バックアップスクリプト(v1.0)作成
- 2025/09/25: ネットワーク設定ガイド追加

---
*このドキュメントは定期的に更新されます。最新情報は[CLAUDE.md](../CLAUDE.md)も参照してください。*