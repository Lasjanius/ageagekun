/**
 * 連結PDF履歴管理UI
 * 履歴の表示、削除、60日経過警告などの機能を提供
 */
const BatchPrintHistory = {
    // 状態管理
    state: {
        prints: [],
        oldCount: 0,
        isLoading: false,
        sortBy: 'createdAt',
        sortOrder: 'desc'
    },

    /**
     * 履歴モーダルを表示
     */
    async showHistoryModal() {
        console.log('📚 Opening batch print history modal...');

        // 既存のモーダルがあれば削除
        this.closeModal();

        // モーダルHTML作成
        const modalHTML = this.createModalHTML();
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // イベントリスナー設定
        this.attachEventListeners();

        // データ取得と表示
        await this.refreshHistory();
    },

    /**
     * モーダルHTMLを生成
     */
    createModalHTML() {
        return `
            <div class="modal" id="batchPrintHistoryModal" style="display: block;">
                <div class="modal__overlay"></div>
                <div class="modal__content" style="max-width: 90%; width: 1000px;">
                    <div class="modal__header">
                        <h2 class="modal__title">📚 連結PDF履歴</h2>
                        <button class="modal__close" id="closeBatchPrintHistoryBtn">✕</button>
                    </div>
                    <div class="modal__body">
                        <!-- 60日警告 -->
                        <div id="oldPrintAlert" class="alert alert--warning" style="display: none; margin-bottom: 15px;">
                            ⚠️ <span id="oldPrintCount">0</span>件のPDFが60日以上経過しています
                        </div>

                        <!-- テーブルコンテナ -->
                        <div style="overflow-x: auto; max-height: 500px; position: relative;">
                            <table class="table" style="width: 100%; border-collapse: collapse;">
                                <thead style="position: sticky; top: 0; background: white; z-index: 1;">
                                    <tr style="border-bottom: 2px solid #dee2e6;">
                                        <th style="padding: 12px; text-align: left;">ファイル名</th>
                                        <th style="padding: 12px; text-align: right;">サイズ</th>
                                        <th style="padding: 12px; text-align: center;">ページ数</th>
                                        <th style="padding: 12px; text-align: center;">文書数</th>
                                        <th style="padding: 12px; text-align: left;">作成日時</th>
                                        <th style="padding: 12px; text-align: center;">操作</th>
                                    </tr>
                                </thead>
                                <tbody id="batchPrintHistoryBody">
                                    <tr>
                                        <td colspan="6" style="text-align: center; padding: 40px;">
                                            <div class="spinner"></div>
                                            <div>読み込み中...</div>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div class="modal__footer" style="display: flex; justify-content: space-between;">
                        <button class="btn btn--secondary" id="closeBatchPrintHistoryBtn2">
                            閉じる
                        </button>
                        <button class="btn btn--primary" id="refreshBatchPrintHistoryBtn">
                            <span class="btn__icon">🔄</span>
                            <span class="btn__text">更新</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * イベントリスナーを設定
     */
    attachEventListeners() {
        // 閉じるボタン（ヘッダー）
        document.getElementById('closeBatchPrintHistoryBtn')?.addEventListener('click', () => {
            this.closeModal();
        });

        // 閉じるボタン（フッター）
        document.getElementById('closeBatchPrintHistoryBtn2')?.addEventListener('click', () => {
            this.closeModal();
        });

        // オーバーレイクリックで閉じる
        document.querySelector('#batchPrintHistoryModal .modal__overlay')?.addEventListener('click', () => {
            this.closeModal();
        });

        // 更新ボタン
        document.getElementById('refreshBatchPrintHistoryBtn')?.addEventListener('click', () => {
            this.refreshHistory();
        });

        // ESCキーで閉じる
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
                document.removeEventListener('keydown', handleEsc);
            }
        };
        document.addEventListener('keydown', handleEsc);
    },

    /**
     * 履歴データを更新
     */
    async refreshHistory() {
        console.log('🔄 Refreshing batch print history...');
        this.state.isLoading = true;
        this.renderTable();

        const result = await BatchPrintHistoryAPI.fetchHistory();

        if (result.success) {
            this.state.prints = result.data.prints || [];
            this.state.oldCount = result.data.oldCount || 0;

            // 60日警告の表示制御
            this.updateOldPrintAlert();

            console.log(`📊 Loaded ${this.state.prints.length} prints, ${this.state.oldCount} are old`);
        } else {
            UI.showToast('履歴の取得に失敗しました', 'error');
            this.state.prints = [];
            this.state.oldCount = 0;
        }

        this.state.isLoading = false;
        this.renderTable();
    },

    /**
     * 60日経過警告を更新
     */
    updateOldPrintAlert() {
        const alertEl = document.getElementById('oldPrintAlert');
        const countEl = document.getElementById('oldPrintCount');

        if (!alertEl || !countEl) return;

        if (this.state.oldCount > 0) {
            countEl.textContent = this.state.oldCount;
            alertEl.style.display = 'block';
        } else {
            alertEl.style.display = 'none';
        }
    },

    /**
     * テーブルを描画
     */
    renderTable() {
        const tbody = document.getElementById('batchPrintHistoryBody');
        if (!tbody) return;

        // 1. ローディング中
        if (this.state.isLoading) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 40px;">
                        <div class="spinner"></div>
                        <div style="margin-top: 10px;">読み込み中...</div>
                    </td>
                </tr>
            `;
            return;
        }

        // 2. 空状態
        if (this.state.prints.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 40px; color: #666;">
                        連結されたPDFがまだありません
                    </td>
                </tr>
            `;
            return;
        }

        // 3. データ表示
        tbody.innerHTML = this.state.prints.map(print => {
            const createdDate = new Date(print.createdAt);
            const isOld = print.isOld;
            const rowStyle = isOld ? 'background-color: #fff3cd; border-left: 4px solid #ffc107;' : '';

            return `
                <tr style="${rowStyle}">
                    <td style="padding: 12px;">
                        ${isOld ? '⚠️ ' : ''}${this.escapeHtml(print.fileName)}
                    </td>
                    <td style="padding: 12px; text-align: right;">
                        ${this.formatFileSize(print.fileSize)}
                    </td>
                    <td style="padding: 12px; text-align: center;">
                        ${print.pageCount}ページ
                    </td>
                    <td style="padding: 12px; text-align: center;">
                        ${print.documentCount}件
                    </td>
                    <td style="padding: 12px;">
                        ${createdDate.toLocaleString('ja-JP')}
                    </td>
                    <td style="padding: 12px; text-align: center;">
                        <button class="btn btn--small btn--primary"
                                onclick="BatchPrintHistory.viewPDF(${print.id})"
                                aria-label="${this.escapeHtml(print.fileName)}を表示">
                            表示
                        </button>
                        <button class="btn btn--small btn--danger"
                                onclick="BatchPrintHistory.confirmDelete(${print.id}, '${this.escapeJs(print.fileName)}')"
                                aria-label="${this.escapeHtml(print.fileName)}を削除"
                                style="margin-left: 5px;">
                            削除
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    },

    /**
     * PDFを表示
     */
    viewPDF(batchId) {
        console.log(`👁️ Viewing PDF with batch ID: ${batchId}`);
        BatchPrintHistoryAPI.viewPDF(batchId);
    },

    /**
     * 削除確認ダイアログを表示
     */
    confirmDelete(batchId, fileName) {
        console.log(`🗑️ Confirming deletion of batch ID: ${batchId}`);

        // 既存の確認モーダルを利用
        if (!UI.elements.confirmModal) {
            console.error('Confirm modal not found');
            return;
        }

        UI.elements.confirmMessage.textContent =
            'この連結PDFを削除してもよろしいですか？';
        UI.elements.confirmList.innerHTML = `
            <li style="color: #ff6b6b; font-weight: bold;">📄 ${this.escapeHtml(fileName)}</li>
            <li style="color: #868e96; font-size: 0.9em;">※ この操作は取り消せません</li>
        `;

        UI.elements.confirmModal.style.display = 'block';
        UI.elements.confirmModal.dataset.action = 'delete-batch-print';
        UI.elements.confirmModal.dataset.batchId = batchId;
    },

    /**
     * モーダルを閉じる
     */
    closeModal() {
        const modal = document.getElementById('batchPrintHistoryModal');
        if (modal) {
            modal.remove();
        }
    },

    /**
     * ファイルサイズをフォーマット
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
    },

    /**
     * HTMLエスケープ
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    /**
     * JavaScript文字列エスケープ
     */
    escapeJs(text) {
        return text.replace(/'/g, "\\'").replace(/"/g, '\\"');
    }
};

// グローバルスコープに公開
window.BatchPrintHistory = BatchPrintHistory;