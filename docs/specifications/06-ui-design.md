# UI/UXデザイン仕様書

## 📌 概要

Ageagekunのユーザーインターフェース設計仕様。モダンなSaaS風のデザインを採用し、医療文書管理の効率化と使いやすさを両立します。

## 🎨 デザインシステム

### デザイン原則
- **シンプル**: 機能を損なわずに視覚的な複雑さを排除
- **直感的**: 学習コストを最小限に抑える操作性
- **一貫性**: 統一されたデザイン言語の使用
- **アクセシブル**: すべてのユーザーが使いやすい設計

### カラーパレット

#### プライマリーカラー
```css
--color-primary: #667eea;      /* メイン紫 */
--color-primary-dark: #5a67d8; /* ホバー時 */
--color-secondary: #764ba2;    /* アクセント */
```

#### グラデーション（v2.3.0更新）
```css
--gradient-primary: linear-gradient(135deg, #667eea 0%, #7080ec 50%, #764ba2 100%);
--gradient-hover: linear-gradient(135deg, #5a67d8 0%, #6575da 50%, #6b4690 100%);
```
- 3色グラデーションで奥行き感を演出
- 中間色を追加して滑らかな遷移を実現

#### セマンティックカラー
```css
--color-success: #48bb78;  /* 成功・完了 */
--color-warning: #f6ad55;  /* 警告・保留 */
--color-danger: #fc8181;   /* エラー・失敗 */
--color-neutral: #718096;  /* 中立・補助 */
```

### タイポグラフィ

#### フォントファミリー
```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto',
             'Oxygen', 'Ubuntu', sans-serif;
```

#### フォントサイズ
- 見出し: 1.2rem〜1.5rem
- 本文: 0.9rem
- 補助: 0.75rem〜0.85rem

#### フォントウェイト
- 通常: 400
- 中: 500（ラベル、ボタン）
- 太: 600（見出し、重要項目）

### スペーシングシステム（v2.3.0更新）

```css
--spacing-xs: 4px;
--spacing-sm: 6px;
--spacing-md: 8px;
--spacing-lg: 12px;
--spacing-xl: 16px;
```

### 角丸（v2.3.0更新）

```css
--radius-sm: 6px;   /* ボタン、入力欄 */
--radius-md: 8px;   /* カード */
--radius-lg: 12px;  /* モーダル、大型要素 */
```
- カクカクした印象を避け、柔らかい印象に統一

## 🧩 コンポーネント

### ボタン（v2.3.0更新）

#### デザイン改善点
- **角丸**: 2px → 6px（柔らかい印象）
- **ホバー効果**:
  - 浮き上がり: translateY(-2px)
  - グロー効果: 多層シャドウ
  - 明度調整: brightness(1.05)
- **アクティブ状態**: 押し込み効果
- **トランジション**: 個別プロパティごとに最適化

```css
.btn {
    border-radius: var(--radius-sm);
    transition: transform 0.15s ease-out,
                box-shadow 0.2s ease-out,
                filter 0.2s ease-out;
}
```

### カード・コンテナ（v2.3.0更新）

#### シャドウの洗練
```css
--shadow-card: 0 2px 12px rgba(0, 0, 0, 0.06);
--shadow-hover: 0 6px 16px rgba(102, 126, 234, 0.12);
```
- より柔らかく自然な影
- ホバー時の立体感を強調

### フォーカス状態（v2.3.0追加）

#### アクセシビリティ向上
- `:focus-visible`擬似クラスの活用
- キーボード操作時のみフォーカスリング表示
- 高コントラストのアウトライン

```css
.btn--primary:focus-visible {
    outline: 2px solid rgba(102, 126, 234, 0.5);
    outline-offset: 2px;
}
```

### トランジション（v2.3.0更新）

#### パフォーマンス最適化
- `transition: all`を廃止
- プロパティごとに個別設定
- GPU活用可能なプロパティ優先

```css
--transition-base: 0.2s ease-out;
--transition-fast: 0.15s ease-out;
```

## 📱 レスポンシブデザイン

### ブレークポイント
- モバイル: 〜768px
- タブレット: 768px〜1024px
- デスクトップ: 1024px〜

### モバイル最適化
- タッチターゲット: 最小44px
- スワイプジェスチャー対応
- 縦向き/横向き対応

## ♿ アクセシビリティ

### WCAG 2.1準拠
- コントラスト比: 最小4.5:1（通常テキスト）
- キーボード操作: 完全サポート
- スクリーンリーダー: ARIA属性適切配置

### 日本語環境対応
- IME入力: 完全サポート
- 文字間隔: 最適化（letter-spacing: 0.02em）
- 縦書き: 将来対応予定

## 🎯 インタラクション

### マイクロインタラクション
- ホバー効果: 即座のフィードバック
- クリック効果: 押下感の演出
- ローディング: プログレス表示

### アニメーション
- duration: 150ms〜300ms
- easing: ease-out基調
- reduced-motion対応

## 📊 パフォーマンス

### CSS最適化
- 変数による一元管理
- 不要なセレクタ削除
- メディアクエリの統合

### レンダリング最適化
- will-change使用制限
- transform/opacity優先
- レイアウトスラッシング回避

## 🔄 バージョン履歴

### v2.3.0（2025年9月19日）
- UI全体の洗練化
- 角丸を6-12pxに統一
- グラデーションを3色化
- ホバーエフェクト強化
- フォーカス状態改善
- トランジション個別最適化

### v2.1.0
- インライン編集UI実装
- アドバイスセレクター追加

### v2.0.0
- 初期デザインシステム確立

## 📝 実装ガイドライン

### CSS変数の使用
すべての色、スペース、角丸は変数を使用：
```css
/* 良い例 */
border-radius: var(--radius-sm);
padding: var(--spacing-md);

/* 悪い例 */
border-radius: 6px;
padding: 8px;
```

### トランジションの設定
プロパティごとに個別設定：
```css
/* 良い例 */
transition: transform 0.15s ease-out,
            box-shadow 0.2s ease-out;

/* 悪い例 */
transition: all 0.3s;
```

### アクセシビリティの確保
フォーカス状態を必ず定義：
```css
button:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
}
```

## 🚀 今後の改善予定

### Phase 1（次回）
- ダークモード対応
- カスタムスクロールバー
- アニメーションライブラリ導入

### Phase 2
- デザイントークン管理システム
- Storybookによるコンポーネント管理
- テーマカスタマイズ機能

---

*最終更新: 2025年9月19日*
*バージョン: 2.3.0*