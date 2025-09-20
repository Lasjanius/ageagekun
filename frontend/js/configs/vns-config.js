/**
 * 訪問看護ステーション登録ページ設定
 */

const VNSConfig = {
    // ページ情報
    title: "訪問看護ステーション新規登録",
    subtitle: "新しい訪問看護ステーション情報を登録します",
    icon: "🏥",
    entityName: "訪問看護ステーション",

    // API設定
    apiMethod: "createVisitingNurseStation",

    // リダイレクト先
    redirectTo: "admin.html",

    // フォームフィールド定義
    fields: [
        {
            name: "name",
            label: "ステーション名",
            type: "text",
            required: true,
            placeholder: "例：さくら訪問看護ステーション",
            validation: (value) => value.length >= 2 && value.length <= 255,
            validationMessage: "ステーション名は2文字以上255文字以下で入力してください"
        },
        {
            name: "address",
            label: "住所",
            type: "textarea",
            required: false,
            placeholder: "例：東京都渋谷区○○1-2-3",
            rows: 3
        },
        {
            name: "tel",
            label: "電話番号",
            type: "tel",
            required: false,
            placeholder: "例：03-1234-5678",
            validation: (value) => {
                if (!value) return true; // 任意項目なので空も許可
                return /^[\d\-\(\)\s\+]+$/.test(value);
            },
            validationMessage: "正しい電話番号の形式で入力してください"
        }
    ],

    // その他設定
    needsOfficeSelect: false, // 事業所選択は不要

    // 成功メッセージのカスタマイズ
    successMessage: "訪問看護ステーションを登録しました",

    // 継続登録のメッセージ
    continueMessage: "続けて他の訪問看護ステーションを登録しますか？"
};