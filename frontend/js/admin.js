/**
 * 管理画面メインページ JavaScript
 * モーダル管理とマスターデータ登録機能
 */

// DOM要素
const elements = {
    // 統計情報
    patientCount: document.getElementById('patientCount'),
    vnsCount: document.getElementById('vnsCount'),
    officeCount: document.getElementById('officeCount'),
    cmCount: document.getElementById('cmCount'),

    // トースト
    toastContainer: document.getElementById('toastContainer')
};

// 統計情報を取得・更新
async function loadStatistics() {
    try {
        // API基底URLを使用
        const API_BASE = 'http://localhost:3000/api';

        // 並行してデータを取得
        const [patientsRes, vnsRes, officesRes, cmRes] = await Promise.all([
            fetch(`${API_BASE}/patients/all`),
            fetch(`${API_BASE}/vns`),
            fetch(`${API_BASE}/care-offices`),
            fetch(`${API_BASE}/care-managers`)
        ]);

        const [patientsData, vnsData, officesData, cmData] = await Promise.all([
            patientsRes.json(),
            vnsRes.json(),
            officesRes.json(),
            cmRes.json()
        ]);

        // 統計情報を更新
        if (elements.patientCount) {
            elements.patientCount.textContent = patientsData.count || 0;
        }
        if (elements.vnsCount) {
            elements.vnsCount.textContent = vnsData.count || 0;
        }
        if (elements.officeCount) {
            elements.officeCount.textContent = officesData.count || 0;
        }
        if (elements.cmCount) {
            elements.cmCount.textContent = cmData.count || 0;
        }
    } catch (error) {
        console.error('統計情報の取得に失敗しました:', error);
        showToast('統計情報の取得に失敗しました', 'error');
    }
}





// トースト通知を表示
function showToast(message, type = 'info') {
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

    if (elements.toastContainer) {
        elements.toastContainer.appendChild(toast);

        // アニメーション適用
        setTimeout(() => toast.classList.add('toast--show'), 10);

        // 3秒後に削除
        setTimeout(() => {
            toast.classList.remove('toast--show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

// URLパラメータから成功メッセージを確認してトースト表示
function checkAndShowSuccessMessage() {
    const urlParams = new URLSearchParams(window.location.search);
    const successMessage = urlParams.get('success');

    if (successMessage) {
        // トースト表示
        showToast(decodeURIComponent(successMessage), 'success');

        // URLパラメータをクリーンアップ（ブラウザ履歴を汚さずに）
        const url = new URL(window.location);
        url.searchParams.delete('success');
        window.history.replaceState({}, document.title, url.pathname);
    }
}

// 初期化
document.addEventListener('DOMContentLoaded', () => {
    console.log('管理画面を初期化しています...');

    // モーダルマネージャーとAPIサービスの確認
    if (!window.modalManager) {
        console.error('modalManager が見つかりません');
        return;
    }
    if (!window.masterDataService) {
        console.error('masterDataService が見つかりません');
        return;
    }

    // 成功メッセージをチェック・表示
    checkAndShowSuccessMessage();

    // 統計情報を読み込み
    loadStatistics();

    // 管理画面はページ遷移方式のため、モーダル設定は不要

    // 5分ごとに統計情報を更新
    setInterval(loadStatistics, 5 * 60 * 1000);
});