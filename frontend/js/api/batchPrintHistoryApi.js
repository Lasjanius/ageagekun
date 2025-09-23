/**
 * 連結PDF履歴管理APIサービス
 * バックエンドの/api/batch-printエンドポイントとの通信を管理
 */
const BatchPrintHistoryAPI = {
    /**
     * 連結PDF履歴一覧を取得
     * @returns {Promise<Object>} 履歴データまたはエラーオブジェクト
     */
    async fetchHistory() {
        try {
            const result = await API.request('/batch-print/history');
            return result;
        } catch (error) {
            console.error('Failed to fetch batch print history:', error);
            // エラー時でも一貫した構造を返す
            return {
                success: false,
                error: error.message || '履歴の取得に失敗しました',
                data: {
                    prints: [],
                    oldCount: 0
                }
            };
        }
    },

    /**
     * 連結PDFを削除
     * @param {number} batchId - 削除するバッチID
     * @returns {Promise<Object>} 削除結果
     */
    async deletePDF(batchId) {
        try {
            const result = await API.request(`/batch-print/${batchId}`, {
                method: 'DELETE'
            });
            return result;
        } catch (error) {
            console.error(`Failed to delete batch print ${batchId}:`, error);
            return {
                success: false,
                error: error.message || '削除に失敗しました'
            };
        }
    },

    /**
     * PDFを新しいタブで表示
     * @param {number} batchId - 表示するバッチID
     * @returns {boolean} 表示成功の可否
     */
    viewPDF(batchId) {
        const url = `${API.baseURL}/batch-print/view/${batchId}`;

        // ポップアップブロッカー対策
        const newWindow = window.open(url, '_blank');

        if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
            // ポップアップがブロックされた場合
            UI.showToast('ポップアップがブロックされました。手動で開いてください。', 'warning');

            // フォールバック: リンクを作成してクリック
            const link = document.createElement('a');
            link.href = url;
            link.target = '_blank';
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            return false;
        }

        return true;
    }
};

// グローバルスコープに公開
window.BatchPrintHistoryAPI = BatchPrintHistoryAPI;