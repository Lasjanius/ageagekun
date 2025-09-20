/**
 * マスターデータ登録ページ共通処理
 * 設定ファイルに基づいて動的にフォームを生成・処理する
 */

class MasterRegistrationPage {
    constructor(config) {
        this.config = config;
        this.form = null;
        this.submitBtn = null;
        this.init();
    }

    /**
     * ページ初期化
     */
    init() {
        // DOM読み込み完了を待つ
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setupPage());
        } else {
            this.setupPage();
        }
    }

    /**
     * ページ設定
     */
    setupPage() {
        // ページタイトルを設定
        this.setPageTitle();

        // フォームフィールドを動的生成
        this.generateFormFields();

        // フォームの初期化
        this.setupForm();

        // パンくずリストの設定
        this.setupBreadcrumb();

        // 必要に応じて事業所セレクトを初期化
        if (this.config.needsOfficeSelect) {
            this.loadOfficeOptions();
        }
    }

    /**
     * ページタイトルを設定
     */
    setPageTitle() {
        const titleElement = document.querySelector('.header__title');
        const subtitleElement = document.querySelector('.header__subtitle');

        if (titleElement) {
            titleElement.innerHTML = `${this.config.icon} ${this.config.title}`;
        }
        if (subtitleElement) {
            subtitleElement.textContent = this.config.subtitle || 'マスターデータの新規登録';
        }

        // ページのタイトルも更新
        document.title = `${this.config.title} - アゲアゲくん`;
    }

    /**
     * パンくずリストを設定
     */
    setupBreadcrumb() {
        const breadcrumbCurrent = document.querySelector('.breadcrumb__current');
        if (breadcrumbCurrent) {
            breadcrumbCurrent.textContent = this.config.title;
        }
    }

    /**
     * フォームフィールドを動的生成
     */
    generateFormFields() {
        const formFieldsContainer = document.getElementById('formFields');
        if (!formFieldsContainer) {
            console.error('フォームフィールドコンテナが見つかりません');
            return;
        }

        // 既存のフィールドをクリア
        formFieldsContainer.innerHTML = '';

        // 各フィールドを生成
        this.config.fields.forEach(field => {
            const fieldElement = this.createFormField(field);
            formFieldsContainer.appendChild(fieldElement);
        });
    }

    /**
     * フォームフィールド要素を作成
     */
    createFormField(field) {
        const fieldDiv = document.createElement('div');
        fieldDiv.className = field.fullWidth ? 'form-group form-group--full' : 'form-group';

        // ラベルを作成
        const label = document.createElement('label');
        label.htmlFor = field.name;
        label.className = 'form-label';
        label.innerHTML = `${field.label} ${field.required ? '<span class="required">*</span>' : ''}`;

        // 入力要素を作成
        let inputElement;

        switch (field.type) {
            case 'textarea':
                inputElement = document.createElement('textarea');
                inputElement.className = 'form-textarea';
                inputElement.rows = field.rows || 3;
                break;

            case 'select':
                inputElement = document.createElement('select');
                inputElement.className = 'form-select';

                // デフォルトオプション
                const defaultOption = document.createElement('option');
                defaultOption.value = '';
                defaultOption.textContent = field.placeholder || '選択してください';
                inputElement.appendChild(defaultOption);
                break;

            default: // text, tel, email, number など
                inputElement = document.createElement('input');
                inputElement.type = field.type || 'text';
                inputElement.className = 'form-input';
                break;
        }

        // 共通属性を設定
        inputElement.id = field.name;
        inputElement.name = field.name;

        if (field.placeholder && field.type !== 'select') {
            inputElement.placeholder = field.placeholder;
        }

        if (field.required) {
            inputElement.required = true;
        }

        // フィールドを組み立て
        fieldDiv.appendChild(label);
        fieldDiv.appendChild(inputElement);

        // ヒントテキストがある場合は追加
        if (field.hint) {
            const hint = document.createElement('span');
            hint.className = 'form-hint';
            hint.textContent = field.hint;
            fieldDiv.appendChild(hint);
        }

        return fieldDiv;
    }

    /**
     * フォーム初期化
     */
    setupForm() {
        this.form = document.getElementById('masterForm');
        this.submitBtn = document.getElementById('submitBtn');

        if (!this.form || !this.submitBtn) {
            console.error('必要なDOM要素が見つかりません');
            return;
        }

        // フォーム送信処理
        this.form.addEventListener('submit', (e) => this.handleSubmit(e));

        // バリデーション設定
        this.setupValidation();
    }

    /**
     * バリデーション設定
     */
    setupValidation() {
        this.config.fields.forEach(field => {
            const element = document.getElementById(field.name);
            if (element && field.required) {
                element.addEventListener('blur', () => this.validateField(field));
            }
        });
    }

    /**
     * フィールドバリデーション
     */
    validateField(field) {
        const element = document.getElementById(field.name);
        const value = element.value.trim();

        // 必須チェック
        if (field.required && !value) {
            this.showFieldError(element, `${field.label}を入力してください`);
            return false;
        }

        // カスタムバリデーション
        if (field.validation && !field.validation(value)) {
            this.showFieldError(element, field.validationMessage || '入力内容に誤りがあります');
            return false;
        }

        // エラー状態をクリア
        this.clearFieldError(element);
        return true;
    }

    /**
     * フィールドエラー表示
     */
    showFieldError(element, message) {
        element.classList.add('form-input--error');

        // 既存のエラーメッセージを削除
        const existingError = element.parentNode.querySelector('.form-error');
        if (existingError) {
            existingError.remove();
        }

        // エラーメッセージを追加
        const errorDiv = document.createElement('div');
        errorDiv.className = 'form-error';
        errorDiv.textContent = message;
        element.parentNode.appendChild(errorDiv);
    }

    /**
     * フィールドエラークリア
     */
    clearFieldError(element) {
        element.classList.remove('form-input--error');
        const errorDiv = element.parentNode.querySelector('.form-error');
        if (errorDiv) {
            errorDiv.remove();
        }
    }

    /**
     * 事業所オプション読み込み
     */
    async loadOfficeOptions() {
        const officeSelect = document.getElementById('office_id');
        if (!officeSelect) return;

        try {
            // ローディング表示
            officeSelect.innerHTML = '<option value="">読み込み中...</option>';
            officeSelect.disabled = true;

            const offices = await window.masterDataService.getCareOffices();

            // オプションを構築
            officeSelect.innerHTML = '<option value="">選択してください</option>';
            offices.forEach(office => {
                const option = document.createElement('option');
                option.value = office.office_id;
                option.textContent = office.name;
                officeSelect.appendChild(option);
            });

            officeSelect.disabled = false;
        } catch (error) {
            console.error('事業所一覧の取得に失敗:', error);

            // エラー時のリトライボタン
            officeSelect.innerHTML = '<option value="">読み込み失敗</option>';
            this.showRetryButton(officeSelect);
        }
    }

    /**
     * リトライボタン表示
     */
    showRetryButton(selectElement) {
        const retryBtn = document.createElement('button');
        retryBtn.type = 'button';
        retryBtn.className = 'btn btn--outline btn--small';
        retryBtn.innerHTML = '<span class="btn__icon">🔄</span><span class="btn__text">再読み込み</span>';
        retryBtn.style.marginLeft = '8px';

        retryBtn.addEventListener('click', () => {
            retryBtn.remove();
            this.loadOfficeOptions();
        });

        selectElement.parentNode.appendChild(retryBtn);
    }

    /**
     * フォーム送信処理
     */
    async handleSubmit(e) {
        e.preventDefault();

        // 全フィールドのバリデーション
        let isValid = true;
        this.config.fields.forEach(field => {
            if (!this.validateField(field)) {
                isValid = false;
            }
        });

        if (!isValid) {
            this.showToast('入力内容を確認してください', 'error');
            return;
        }

        // フォームデータを収集
        const formData = this.collectFormData();

        // 送信処理
        await this.submitData(formData);
    }

    /**
     * フォームデータ収集
     */
    collectFormData() {
        const data = {};

        this.config.fields.forEach(field => {
            const element = document.getElementById(field.name);
            if (element) {
                let value = element.value.trim();

                // 型変換
                if (field.type === 'number' && value) {
                    value = parseInt(value, 10);
                } else if (!value) {
                    value = null;
                }

                data[field.name] = value;
            }
        });

        return data;
    }

    /**
     * データ送信
     */
    async submitData(data) {
        // ボタンを無効化
        this.submitBtn.disabled = true;
        this.submitBtn.innerHTML = '<span class="btn__icon">⏳</span><span class="btn__text">登録中...</span>';

        try {
            // APIメソッドを動的に呼び出し
            const result = await window.masterDataService[this.config.apiMethod](data);

            // 成功時の動線（即座にリダイレクト）
            this.handleSuccess(result);

        } catch (error) {
            console.error('登録エラー:', error);

            const message = error instanceof APIError
                ? error.getLocalizedMessage()
                : '登録処理中にエラーが発生しました';

            this.showToast(message, 'error');
        } finally {
            // ボタンを元に戻す
            this.submitBtn.disabled = false;
            this.submitBtn.innerHTML = '<span class="btn__icon">💾</span><span class="btn__text">登録</span>';
        }
    }

    /**
     * 成功時の処理
     */
    handleSuccess(result) {
        // 成功メッセージをURLパラメータとして渡す
        const successMessage = this.config.successMessage || `${this.config.entityName}を登録しました`;
        const encodedMessage = encodeURIComponent(successMessage);

        if (this.config.redirectTo) {
            location.href = `${this.config.redirectTo}?success=${encodedMessage}`;
        } else {
            // デフォルトは管理画面に戻る
            location.href = `admin.html?success=${encodedMessage}`;
        }
    }

    /**
     * トースト通知表示
     */
    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast--${type}`;

        const icon = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        }[type] || 'ℹ️';

        toast.innerHTML = `
            <span class="toast__icon">${icon}</span>
            <span class="toast__message">${message}</span>
        `;

        // トーストコンテナに追加
        let toastContainer = document.getElementById('toastContainer');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'toastContainer';
            toastContainer.className = 'toast-container';
            document.body.appendChild(toastContainer);
        }

        toastContainer.appendChild(toast);

        // アニメーション適用
        setTimeout(() => toast.classList.add('toast--show'), 10);

        // 3秒後に削除
        setTimeout(() => {
            toast.classList.remove('toast--show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

// グローバルに公開
window.MasterRegistrationPage = MasterRegistrationPage;