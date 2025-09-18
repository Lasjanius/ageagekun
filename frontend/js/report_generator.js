/**
 * 居宅療養管理指導報告書生成モジュール
 */

class KyotakuReportGenerator {
    constructor() {
        this.apiBaseUrl = 'http://localhost:3000/api';
    }

    /**
     * 患者IDから報告書データを取得
     * @param {number} patientId - 患者ID
     * @returns {Promise<Object>} 報告書データ
     */
    async fetchReportData(patientId) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/patients/${patientId}/kyotaku-report`);

            if (!response.ok) {
                throw new Error(`Failed to fetch patient data: ${response.statusText}`);
            }

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || 'Failed to fetch patient data');
            }

            return result.data;
        } catch (error) {
            console.error('Error fetching report data:', error);
            throw error;
        }
    }

    /**
     * テンプレートにデータを適用
     * @param {Object} data - 報告書データ
     */
    applyDataToTemplate(data) {
        // data-field属性を持つ要素を全て取得
        const fieldElements = document.querySelectorAll('[data-field]');

        fieldElements.forEach(element => {
            const field = element.getAttribute('data-field');

            // データマッピング
            const mappings = {
                'period_start': data.period_start,
                'period_end': data.period_end,
                'cm_name': data.cm_name,
                'homecare_office_name': data.homecare_office_name,
                'homecare_office_address': data.homecare_office_address,
                'patient_name': data.patient_name,
                'birthdate': data.birthdate,
                'age': data.age,
                'address': data.address,
                'exam_date': `${data.exam_date} ${data.doctor_name}`,
                'next_exam_date': data.next_exam_date,
                'care_level': data.care_level,
                'primary_disease': data.primary_disease,
                'medical_content': data.medical_content
            };

            if (mappings[field] !== undefined) {
                element.textContent = mappings[field];
            }
        });

        // 生活指導項目の表示制御
        if (data.advices && Array.isArray(data.advices)) {
            // まず全ての項目を非表示にする
            document.querySelectorAll('[data-advice]').forEach(el => {
                el.style.display = 'none';
            });

            // 該当する項目のみ表示
            data.advices.forEach(adviceType => {
                const adviceElement = document.querySelector(`[data-advice="${adviceType}"]`);
                if (adviceElement) {
                    adviceElement.style.display = 'flex';
                }
            });
        }

        // 生成日時の更新
        const footerElement = document.querySelector('.generated-info');
        if (footerElement) {
            footerElement.textContent = `生成日時: ${data.generated_date}`;
        }
    }

    /**
     * 報告書を生成して表示
     * @param {number} patientId - 患者ID
     */
    async generateReport(patientId) {
        try {
            // ローディング表示
            this.showLoading();

            // データ取得
            const data = await this.fetchReportData(patientId);

            // テンプレートに適用
            this.applyDataToTemplate(data);

            // ローディング非表示
            this.hideLoading();

            console.log('Report generated successfully:', data);
            return data;
        } catch (error) {
            console.error('Error generating report:', error);
            this.hideLoading();
            this.showError(error.message);
            throw error;
        }
    }

    /**
     * URLパラメータから患者IDを取得
     * @returns {number|null} 患者ID
     */
    getPatientIdFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        const patientId = urlParams.get('patientId');
        return patientId ? parseInt(patientId, 10) : null;
    }

    /**
     * ローディング表示
     */
    showLoading() {
        const existingLoader = document.querySelector('.report-loading');
        if (existingLoader) {
            existingLoader.style.display = 'flex';
            return;
        }

        const loader = document.createElement('div');
        loader.className = 'report-loading';
        loader.innerHTML = `
            <div style="
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 9999;
            ">
                <div style="
                    background: white;
                    padding: 20px;
                    border-radius: 8px;
                    text-align: center;
                ">
                    <p>データを取得中...</p>
                </div>
            </div>
        `;
        document.body.appendChild(loader);
    }

    /**
     * ローディング非表示
     */
    hideLoading() {
        const loader = document.querySelector('.report-loading');
        if (loader) {
            loader.style.display = 'none';
        }
    }

    /**
     * エラー表示
     * @param {string} message - エラーメッセージ
     */
    showError(message) {
        const existingError = document.querySelector('.report-error');
        if (existingError) {
            existingError.remove();
        }

        const errorDiv = document.createElement('div');
        errorDiv.className = 'report-error';
        errorDiv.innerHTML = `
            <div style="
                position: fixed;
                top: 20px;
                right: 20px;
                background: #f8d7da;
                color: #721c24;
                padding: 15px;
                border-radius: 4px;
                border: 1px solid #f5c6cb;
                max-width: 400px;
                z-index: 10000;
            ">
                <strong>エラー:</strong> ${message}
                <button onclick="this.parentElement.parentElement.remove()" style="
                    margin-left: 10px;
                    background: transparent;
                    border: none;
                    color: #721c24;
                    cursor: pointer;
                    font-weight: bold;
                ">×</button>
            </div>
        `;
        document.body.appendChild(errorDiv);

        // 5秒後に自動で削除
        setTimeout(() => {
            if (errorDiv.parentElement) {
                errorDiv.remove();
            }
        }, 5000);
    }

    /**
     * 印刷機能
     */
    print() {
        window.print();
    }

    /**
     * PDF出力（要追加ライブラリ）
     * @param {string} filename - 出力ファイル名
     */
    async exportPDF(filename = '居宅療養管理指導報告書.pdf') {
        // html2pdf.jsなどのライブラリを使用する場合の実装
        console.log('PDF export requires additional library (e.g., html2pdf.js)');
        alert('PDF出力機能を使用するには、追加のライブラリが必要です。');
    }
}

// グローバルインスタンスの作成
const reportGenerator = new KyotakuReportGenerator();

// ページ読み込み時の自動実行
document.addEventListener('DOMContentLoaded', function() {
    console.log('[report_generator.js] DOMContentLoaded - 初期化開始');

    // LocalStorageからのデータを優先的にチェック
    const storedData = localStorage.getItem('kyotakuReportData');
    if (storedData) {
        console.log('[report_generator.js] ✅ LocalStorageデータが存在します。');
        console.log('[report_generator.js] ✅ kyotaku_report_template.htmlの処理に委譲します。');
        // LocalStorageのデータがある場合は、report_generator.jsは何もしない
        return;
    }

    // URLパラメータから患者IDを取得（レガシー処理として残す）
    const patientId = reportGenerator.getPatientIdFromUrl();
    console.log('[report_generator.js] URLパラメータのpatientId:', patientId || 'なし');

    if (patientId) {
        // 患者IDがある場合は自動で報告書生成（レガシー処理）
        console.warn('[report_generator.js] ⚠️ レガシー処理: URLパラメータによる報告書生成');
        console.log('[report_generator.js] PatientID:', patientId, 'でAPIから報告書生成を試みます');
        reportGenerator.generateReport(patientId).catch(error => {
            console.error('[report_generator.js] ❌ 報告書生成失敗:', error);
            // エラーメッセージを画面に表示
            const errorDiv = document.createElement('div');
            errorDiv.style.cssText = 'position: fixed; top: 20px; right: 20px; background: #f44336; color: white; padding: 15px; border-radius: 4px; z-index: 9999;';
            errorDiv.textContent = `報告書の生成に失敗しました: ${error.message}`;
            document.body.appendChild(errorDiv);
        });
    } else {
        // 正常な動作（LocalStorageもURLパラメータもない場合）
        console.log('[report_generator.js] ℹ️ データソースなし: LocalStorageまたはURLパラメータが必要です');
        console.log('[report_generator.js] ℹ️ ai_report.htmlから報告書を生成してください');
    }

    // 印刷ボタンの設定（もしあれば）
    const printButton = document.querySelector('#printButton');
    if (printButton) {
        printButton.addEventListener('click', () => reportGenerator.print());
    }

    // PDF出力ボタンの設定（もしあれば）
    const pdfButton = document.querySelector('#exportPdfButton');
    if (pdfButton) {
        pdfButton.addEventListener('click', () => reportGenerator.exportPDF());
    }
});

// エクスポート（モジュール環境の場合）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = KyotakuReportGenerator;
}