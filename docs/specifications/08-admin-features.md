# 管理画面機能仕様書

## 概要

管理画面は、システムの統計情報表示とマスターデータ管理を行う中核的な管理インターフェースです。

## 機能一覧

### 1. 統計情報ダッシュボード

#### 表示項目
- **患者数**: 登録されている全患者数
- **書類数**: システムに登録されている全書類数
- **訪問看護ステーション数**: 登録されているVNS数
- **居宅介護支援事業所数**: 登録されている事業所数
- **ケアマネージャー数**: 登録されているケアマネージャー数

#### 自動更新
- 初回ロード時に統計情報を取得
- 5分ごとに自動更新（`setInterval`）
- リアルタイム同期により他クライアントの変更も反映

### 2. マスターデータ登録機能（v3.3.0改訂）

#### アーキテクチャ変更
**従来**: モーダルダイアログによる登録
**現在**: ページ遷移方式による独立した登録画面

#### 理由
- より適切なUXパターン（メインタスクはページ、サブタスクはモーダル）
- 複雑なフォームに適した画面占有
- ブラウザの戻る/進むボタンとの親和性

#### 実装構成

##### 共通テンプレートシステム
- **master-registration.js**: 動的フォーム生成エンジン
  - 設定オブジェクトからフォームフィールドを自動生成
  - バリデーション処理
  - API呼び出し
  - 成功後のリダイレクト処理

##### 設定ファイル
- **vns-config.js**: 訪問看護ステーション設定
- **office-config.js**: 居宅介護支援事業所設定
- **cm-config.js**: ケアマネージャー設定

##### 登録ページ
- **vns-registration.html**: 訪問看護ステーション登録
- **office-registration.html**: 居宅介護支援事業所登録
- **cm-registration.html**: ケアマネージャー登録

### 3. モーダル管理システム（v3.4.0改訂）

#### z-index管理の改善
**問題**: モーダルオーバーレイがコンテンツの上に表示される
**原因**: `modal__content`にz-indexが未設定

**解決策**:
```javascript
// modalManager.js open()メソッド
const overlay = modal.querySelector('.modal__overlay');
if (overlay) {
    overlay.style.zIndex = zIndex - 1;  // 999
}

const content = modal.querySelector('.modal__content');
if (content) {
    content.style.zIndex = zIndex + 1;  // 1001
}
```

**結果**:
- オーバーレイ: z-index 999（背景）
- コンテンツ: z-index 1001（前面）

#### close()メソッドの改善
- インラインz-indexスタイルをクリア
- 次回オープン時のための初期化

### 4. トースト通知システム（v3.4.0改訂）

#### 登録完了後の通知フロー変更

**従来**: 登録画面で1.5秒待機→トースト表示→ページ遷移

**現在**: 即座にページ遷移→管理画面でトースト表示

**実装**:
1. 登録成功時にURLパラメータで成功メッセージを渡す
2. 管理画面で`URLSearchParams`でメッセージ取得
3. トースト表示後、`history.replaceState`でURL清掃

**メリット**:
- 即座のフィードバック
- 統一されたトースト表示位置
- クリーンなURL管理

### 5. プルダウン状態保持機能（v3.4.0新規）

#### 問題
患者登録画面でモーダルから新規登録後、既存のプルダウン選択が消える

#### 解決策
`refreshSelects()`関数の改善:

```javascript
async function refreshSelects() {
    // 1. 現在の選択値を保存
    const savedOffice = elements.officeSelect.value;
    const savedCm = elements.cmSelect.value;
    const savedVns = elements.vnsSelect.value;

    // 2. データ再読み込み
    await loadMasterData();

    // 3. 選択値を復元
    elements.officeSelect.value = savedOffice;
    elements.vnsSelect.value = savedVns;

    // 4. 依存関係のあるプルダウンは非同期処理を待つ
    if (savedOffice && savedCm) {
        // CMリストの更新完了を待つ
        const waitForCmOption = setInterval(() => {
            const cmOption = elements.cmSelect.querySelector(`option[value="${savedCm}"]`);
            if (cmOption) {
                elements.cmSelect.value = savedCm;
                clearInterval(waitForCmOption);
            }
        }, 50);
    }
}
```

#### 技術的ポイント
- 非同期処理（Office→CM）の競合回避
- ポーリングによる確実な復元
- タイムアウト処理による無限ループ防止

## API仕様

### エンドポイント
- `GET /api/statistics` - 統計情報取得
- `GET /api/care-offices` - 事業所一覧
- `POST /api/care-offices` - 事業所登録
- `GET /api/care-managers` - ケアマネージャー一覧
- `POST /api/care-managers` - ケアマネージャー登録
- `GET /api/vns` - 訪問看護ステーション一覧
- `POST /api/vns` - 訪問看護ステーション登録

### レスポンス形式
```json
{
  "success": true,
  "count": 3,
  "offices": [
    {
      "office_id": 1,
      "name": "Care Plan Center A",
      "address": "東京都..."
    }
  ]
}
```

## ファイル構成

### JavaScript
- `admin.js` - 管理画面メインロジック
- `master-registration.js` - 共通登録テンプレート
- `modalManager.js` - モーダル管理システム
- `masterDataService.js` - マスターデータAPI共通サービス

### HTML
- `admin.html` - 管理画面メインページ
- `*-registration.html` - 各種登録ページ

### CSS
- `admin.css` - 管理画面専用スタイル
- `styles.css` - 共通スタイル

## UX設計原則

### ページ遷移 vs モーダル
- **ページ遷移**: メインタスク、複雑なフォーム
- **モーダル**: サブタスク、簡単な確認

### フィードバック
- 即座の視覚的フィードバック
- 成功/エラーの明確な表示
- プログレス表示

### エラーハンドリング
- ユーザーフレンドリーなエラーメッセージ
- リトライオプションの提供
- データ保護（入力内容の保持）

## セキュリティ考慮事項

- XSS対策: 入力値のサニタイズ
- CSRF対策: 将来的にトークン実装予定
- SQLインジェクション対策: パラメータクエリ使用

## パフォーマンス最適化

- キャッシュ戦略: masterDataServiceで5分間キャッシュ
- 遅延読み込み: 必要時のみデータ取得
- バンドリング: 将来的にWebpack導入予定

## 今後の改善予定

1. **マスターデータ編集機能**
   - インライン編集
   - 一括更新

2. **高度な統計機能**
   - グラフ表示
   - 期間フィルター
   - エクスポート機能

3. **権限管理**
   - ロールベースアクセス制御
   - 監査ログ

---

*最終更新: 2025年9月20日*
*バージョン: 3.4.0*