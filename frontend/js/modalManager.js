/**
 * モーダル管理システム
 * ネストモーダルのスタック管理、z-index自動調整、データ保持機能を提供
 */

class ModalManager {
    constructor() {
        this.modalStack = [];
        this.baseZIndex = 1000;
        this.zIndexIncrement = 10;
        this.savedStates = new Map();
    }

    /**
     * モーダルを開く
     * @param {string} modalId - モーダルのDOM ID
     * @param {Object} options - オプション設定
     */
    open(modalId, options = {}) {
        const modal = document.getElementById(modalId);
        if (!modal) {
            console.error(`Modal with id "${modalId}" not found`);
            return;
        }

        // 現在のモーダルがあればその状態を保存
        if (this.modalStack.length > 0) {
            const currentModal = this.modalStack[this.modalStack.length - 1];
            this.saveModalState(currentModal.id);
            // 親モーダルをアクセシビリティから隠す
            const parentModal = document.getElementById(currentModal.id);
            if (parentModal) {
                parentModal.setAttribute('aria-hidden', 'true');
            }
        }

        // z-indexを計算して設定
        const zIndex = this.baseZIndex + (this.modalStack.length * this.zIndexIncrement);
        modal.style.zIndex = zIndex;

        // オーバーレイがあればz-indexを設定
        const overlay = modal.querySelector('.modal__overlay');
        if (overlay) {
            overlay.style.zIndex = zIndex - 1;
        }

        // コンテンツのz-indexを設定（オーバーレイより前面に）
        const content = modal.querySelector('.modal__content');
        if (content) {
            content.style.zIndex = zIndex + 1;
        }

        // モーダルを表示
        modal.style.display = 'block';
        modal.setAttribute('aria-hidden', 'false');
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');

        // スタックに追加
        this.modalStack.push({
            id: modalId,
            options,
            zIndex,
            onClose: options.onClose
        });

        // 最初のモーダルの場合、bodyのスクロールを無効化
        if (this.modalStack.length === 1) {
            document.body.style.overflow = 'hidden';
        }

        // フォーカス管理
        this.setFocus(modal);

        // ESCキーでモーダルを閉じる
        this.setupEscapeKey(modalId);

        // オーバーレイクリックで閉じる
        if (options.closeOnOverlayClick !== false) {
            this.setupOverlayClick(modalId);
        }

        return modal;
    }

    /**
     * モーダルを閉じる
     * @param {string} modalId - モーダルのDOM ID
     * @param {Object} result - モーダルの結果データ
     */
    close(modalId, result = null) {
        const modalIndex = this.modalStack.findIndex(m => m.id === modalId);
        if (modalIndex === -1) {
            console.warn(`Modal "${modalId}" is not in the stack`);
            return;
        }

        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'none';
            modal.setAttribute('aria-hidden', 'true');

            // z-indexスタイルをクリア
            modal.style.zIndex = '';
            const overlay = modal.querySelector('.modal__overlay');
            if (overlay) {
                overlay.style.zIndex = '';
            }
            const content = modal.querySelector('.modal__content');
            if (content) {
                content.style.zIndex = '';
            }
        }

        // スタックから削除
        const removedModal = this.modalStack.splice(modalIndex, 1)[0];

        // コールバック実行
        if (removedModal.onClose && typeof removedModal.onClose === 'function') {
            removedModal.onClose(result);
        }

        // 親モーダルがあれば復元
        if (this.modalStack.length > 0) {
            const parentModal = this.modalStack[this.modalStack.length - 1];
            const parentElement = document.getElementById(parentModal.id);
            if (parentElement) {
                parentElement.setAttribute('aria-hidden', 'false');
                this.restoreModalState(parentModal.id);
                this.setFocus(parentElement);
            }
        } else {
            // すべてのモーダルが閉じられた場合、スクロールを復元
            document.body.style.overflow = '';
        }

        // 保存された状態をクリア
        this.savedStates.delete(modalId);
    }

    /**
     * すべてのモーダルを閉じる
     */
    closeAll() {
        while (this.modalStack.length > 0) {
            const modal = this.modalStack[this.modalStack.length - 1];
            this.close(modal.id);
        }
    }

    /**
     * モーダルの状態を保存
     * @param {string} modalId - モーダルのDOM ID
     */
    saveModalState(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return;

        const state = {};

        // フォーム要素の値を保存
        const inputs = modal.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            if (input.id) {
                if (input.type === 'checkbox') {
                    state[input.id] = input.checked;
                } else if (input.type === 'radio') {
                    if (input.checked) {
                        state[input.name] = input.value;
                    }
                } else {
                    state[input.id] = input.value;
                }
            }
        });

        this.savedStates.set(modalId, state);
    }

    /**
     * モーダルの状態を復元
     * @param {string} modalId - モーダルのDOM ID
     */
    restoreModalState(modalId) {
        const modal = document.getElementById(modalId);
        const state = this.savedStates.get(modalId);

        if (!modal || !state) return;

        // フォーム要素の値を復元
        Object.keys(state).forEach(key => {
            const element = modal.querySelector(`#${key}`);
            if (element) {
                if (element.type === 'checkbox') {
                    element.checked = state[key];
                } else if (element.type === 'radio') {
                    const radio = modal.querySelector(`input[name="${key}"][value="${state[key]}"]`);
                    if (radio) radio.checked = true;
                } else {
                    element.value = state[key];
                }
            }
        });
    }

    /**
     * フォーカスを設定
     * @param {HTMLElement} modal - モーダル要素
     */
    setFocus(modal) {
        // 最初のフォーカス可能な要素を探す
        const focusableElements = modal.querySelectorAll(
            'button, [href], input:not([disabled]), select:not([disabled]), ' +
            'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );

        if (focusableElements.length > 0) {
            // 閉じるボタンがあれば優先、なければ最初の要素
            const closeBtn = modal.querySelector('.modal__close');
            if (closeBtn) {
                closeBtn.focus();
            } else {
                focusableElements[0].focus();
            }
        }
    }

    /**
     * ESCキーでモーダルを閉じる設定
     * @param {string} modalId - モーダルのDOM ID
     */
    setupEscapeKey(modalId) {
        const handler = (e) => {
            if (e.key === 'Escape' || e.keyCode === 27) {
                // 最上位のモーダルのみ閉じる
                if (this.modalStack.length > 0 &&
                    this.modalStack[this.modalStack.length - 1].id === modalId) {
                    this.close(modalId);
                    document.removeEventListener('keydown', handler);
                }
            }
        };
        document.addEventListener('keydown', handler);
    }

    /**
     * オーバーレイクリックでモーダルを閉じる設定
     * @param {string} modalId - モーダルのDOM ID
     */
    setupOverlayClick(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return;

        const overlay = modal.querySelector('.modal__overlay');
        if (overlay) {
            overlay.addEventListener('click', () => {
                // 最上位のモーダルのみ閉じる
                if (this.modalStack.length > 0 &&
                    this.modalStack[this.modalStack.length - 1].id === modalId) {
                    this.close(modalId);
                }
            });
        }
    }

    /**
     * 現在開いているモーダルの数を取得
     */
    getStackSize() {
        return this.modalStack.length;
    }

    /**
     * 現在最上位のモーダルIDを取得
     */
    getCurrentModalId() {
        if (this.modalStack.length === 0) return null;
        return this.modalStack[this.modalStack.length - 1].id;
    }

    /**
     * 現在最上位のモーダルのオプションを取得
     */
    getCurrentModalOptions() {
        if (this.modalStack.length === 0) return null;
        return this.modalStack[this.modalStack.length - 1].options;
    }
}

// シングルトンインスタンスをエクスポート
window.modalManager = new ModalManager();