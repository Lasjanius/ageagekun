/**
 * ケアマネージャー登録ページ設定
 */

const CMConfig = {
    // ページ情報
    title: "ケアマネージャー新規登録",
    subtitle: "新しいケアマネージャー情報を登録します",
    icon: "👥",
    entityName: "ケアマネージャー",

    // API設定
    apiMethod: "createCareManager",

    // リダイレクト先
    redirectTo: "admin.html",

    // フォームフィールド定義
    fields: [
        {
            name: "name",
            label: "ケアマネージャー名",
            type: "text",
            required: true,
            placeholder: "例：田中 太郎",
            validation: (value) => value.length >= 2 && value.length <= 255,
            validationMessage: "ケアマネージャー名は2文字以上255文字以下で入力してください"
        },
        {
            name: "office_id",
            label: "所属事業所",
            type: "select",
            required: false,
            placeholder: "選択してください",
            validation: (value) => {
                // 任意項目なので空も許可
                return true;
            }
        }
    ],

    // その他設定
    needsOfficeSelect: true, // 事業所選択が必要

    // 成功メッセージのカスタマイズ
    successMessage: "ケアマネージャーを登録しました",

    // 継続登録のメッセージ
    continueMessage: "続けて他のケアマネージャーを登録しますか？"
};