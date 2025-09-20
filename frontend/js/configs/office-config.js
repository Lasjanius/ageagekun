/**
 * 居宅介護支援事業所登録ページ設定
 */

const OfficeConfig = {
    // ページ情報
    title: "居宅介護支援事業所新規登録",
    subtitle: "新しい居宅介護支援事業所情報を登録します",
    icon: "🏢",
    entityName: "居宅介護支援事業所",

    // API設定
    apiMethod: "createCareOffice",

    // リダイレクト先
    redirectTo: "admin.html",

    // フォームフィールド定義
    fields: [
        {
            name: "name",
            label: "事業所名",
            type: "text",
            required: true,
            placeholder: "例：ひまわり居宅介護支援事業所",
            validation: (value) => value.length >= 2 && value.length <= 255,
            validationMessage: "事業所名は2文字以上255文字以下で入力してください"
        },
        {
            name: "address",
            label: "住所",
            type: "textarea",
            required: true,
            placeholder: "例：東京都渋谷区○○1-2-3\n○○ビル2階",
            rows: 3,
            validation: (value) => value.length >= 5 && value.length <= 500,
            validationMessage: "住所は5文字以上500文字以下で入力してください"
        }
    ],

    // その他設定
    needsOfficeSelect: false, // 事業所選択は不要

    // 成功メッセージのカスタマイズ
    successMessage: "居宅介護支援事業所を登録しました",

    // 継続登録のメッセージ
    continueMessage: "続けて他の居宅介護支援事業所を登録しますか？"
};