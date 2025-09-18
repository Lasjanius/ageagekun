/**
 * 居宅療養管理指導書 AI生成モジュール
 */
class KyotakuAIGenerator {
    constructor() {
        this.apiEndpoint = '/api/generate-kyotaku-report';
        this.templatePath = '/templates/kyotaku_report_template.html';
        this.isGenerating = false;
    }

    /**
     * 初期化
     */
    async init() {
        await this.loadTemplate();
        this.setupEventListeners();
    }

    /**
     * テンプレート読み込み
     */
    async loadTemplate() {
        try {
            const response = await fetch(this.templatePath);
            this.templateHTML = await response.text();
        } catch (error) {
            console.error('テンプレート読み込みエラー:', error);
        }
    }

    /**
     * AIによる居宅療養管理指導書生成
     * @param {Object} patientData - 患者データ
     * @param {string} karteContent - カルテ内容
     */
    async generateReport(patientData, karteContent) {
        if (this.isGenerating) {
            this.showNotification('既に生成処理中です', 'warning');
            return;
        }

        this.isGenerating = true;
        this.showLoadingOverlay(true);

        try {
            // 診察日から対象期間を計算
            const examDate = new Date(patientData.exam_date);
            const periodStart = new Date(examDate.getFullYear(), examDate.getMonth(), 1);
            const periodEnd = new Date(examDate.getFullYear(), examDate.getMonth() + 1, 0);

            // AIに送るリクエストデータ
            const requestData = {
                patient_info: {
                    patient_id: patientData.patient_id,
                    patient_name: patientData.patient_name,
                    birthdate: patientData.birthdate,
                    age: this.calculateAge(patientData.birthdate),
                    address: patientData.address,
                    cm_name: patientData.cm_name || patientData.CMName,
                    care_level: patientData.care_level,
                    primary_disease: patientData.primary_disease
                },
                medical_info: {
                    exam_date: patientData.exam_date,
                    doctor_name: patientData.doctor_name,
                    next_exam_date: patientData.next_exam_date,
                    karte_content: karteContent
                },
                period: {
                    start: this.formatDate(periodStart),
                    end: this.formatDate(periodEnd)
                },
                template_requirements: {
                    summarize_karte: true,
                    generate_advice: true,
                    advice_categories: this.determineAdviceCategories(karteContent)
                }
            };

            // AI生成APIを呼び出し
            const response = await fetch(this.apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestData)
            });

            if (!response.ok) {
                throw new Error(`生成エラー: ${response.status}`);
            }

            const generatedData = await response.json();

            // 生成されたデータでレポートを作成
            const reportHTML = this.renderReport(generatedData);

            // プレビューと保存オプションを表示
            this.showReportPreview(reportHTML, generatedData);

            return generatedData;

        } catch (error) {
            console.error('居宅療養管理指導書生成エラー:', error);
            this.showNotification(`生成エラー: ${error.message}`, 'error');
        } finally {
            this.isGenerating = false;
            this.showLoadingOverlay(false);
        }
    }

    /**
     * 診療内容から生活指導カテゴリを判定（最も関連深い1個のみ）
     */
    determineAdviceCategories(karteContent) {
        const contentText = karteContent ? karteContent.toLowerCase() : '';

        // 診療内容のキーワードから判定（優先順位付き）
        const medicalMapping = [
            { category: 'diabetes', keywords: ['血糖', 'hba1c', 'インスリン', '糖尿病', 'dm'] },
            { category: 'hypertension', keywords: ['血圧', 'mmhg', '降圧薬', '高血圧'] },
            { category: 'dementia', keywords: ['認知', '記憶', 'mmse', '見当識', '物忘れ'] },
            { category: 'kidney', keywords: ['腎機能', 'クレアチニン', '透析', 'egfr', 'ckd'] },
            { category: 'bedridden', keywords: ['臥床', '褥瘡', '体位変換', '寝たきり'] },
            { category: 'aspiration', keywords: ['嚥下', '誤嚥', 'むせ', '食事形態', 'とろみ'] },
            { category: 'fall_prevention', keywords: ['転倒', '歩行', 'ふらつき', '杖', '膝痛'] },
            { category: 'malnutrition', keywords: ['栄養', 'アルブミン', '体重減少', 'bmi', '低栄養'] },
            { category: 'lipid', keywords: ['コレステロール', '中性脂肪', 'ldl', 'hdl', '脂質'] }
        ];

        // 最初にマッチしたカテゴリを1つだけ返す
        for (const mapping of medicalMapping) {
            if (mapping.keywords.some(keyword => contentText.includes(keyword))) {
                return [mapping.category];
            }
        }

        // マッチしない場合は転倒予防を既定値として返す
        return ['fall_prevention'];
    }

    /**
     * レポートのレンダリング
     */
    renderReport(data) {
        // テンプレートHTMLをパース
        const parser = new DOMParser();
        const doc = parser.parseFromString(this.templateHTML, 'text/html');

        // データを適用
        const reportData = {
            period_start: data.period_start,
            period_end: data.period_end,
            cm_name: data.cm_name,
            patient_name: data.patient_name,
            birthdate: data.birthdate,
            age: data.age,
            address: data.address,
            exam_date: data.exam_date,
            doctor_name: data.doctor_name,
            next_exam_date: data.next_exam_date,
            care_level: data.care_level,
            primary_disease: data.primary_disease,
            medical_content: data.medical_content || data.karte_summary,
            advices: data.selected_advices || [],
            generated_date: new Date().toLocaleString('ja-JP')
        };

        // プレースホルダーを置換
        doc.querySelectorAll('[data-field]').forEach(element => {
            const field = element.getAttribute('data-field');
            console.log(`Processing field: ${field}, value: ${reportData[field]}`);
            console.log(`Original textContent: "${element.textContent}"`);
            
            if (reportData[field]) {
                // 既存のテキスト内容を保持しつつ、{{field}}の部分のみを置換
                const originalText = element.textContent;
                element.textContent = element.textContent.replace(/\{\{.*?\}\}/g, reportData[field]);
                console.log(`After replacement: "${element.textContent}"`);
            }
        });

        // 生活指導項目の表示
        if (reportData.advices && Array.isArray(reportData.advices)) {
            reportData.advices.forEach(adviceType => {
                const adviceElement = doc.querySelector(`[data-advice="${adviceType}"]`);
                if (adviceElement) {
                    adviceElement.style.display = 'flex';
                }
            });
        }

        return doc.documentElement.outerHTML;
    }

    /**
     * レポートプレビュー表示
     */
    showReportPreview(htmlContent, data) {
        const modal = this.createPreviewModal();
        const iframe = modal.querySelector('#reportPreviewFrame');

        // iframeにコンテンツを設定
        iframe.srcdoc = htmlContent;

        // 保存ボタンのイベント
        modal.querySelector('#saveReportBtn').addEventListener('click', () => {
            this.saveReport(data);
        });

        // 印刷ボタンのイベント
        modal.querySelector('#printReportBtn').addEventListener('click', () => {
            iframe.contentWindow.print();
        });

        // PDF出力ボタンのイベント
        modal.querySelector('#exportPdfBtn').addEventListener('click', () => {
            this.exportToPDF(htmlContent, data.patient_name);
        });

        document.body.appendChild(modal);
    }

    /**
     * プレビューモーダル作成
     */
    createPreviewModal() {
        const modal = document.createElement('div');
        modal.className = 'kyotaku-preview-modal';
        modal.innerHTML = `
            <div class="modal-overlay"></div>
            <div class="modal-content">
                <div class="modal-header">
                    <h2>居宅療養管理指導書 プレビュー</h2>
                    <button class="close-btn">&times;</button>
                </div>
                <div class="modal-body">
                    <iframe id="reportPreviewFrame" style="width: 100%; height: 600px; border: 1px solid #ddd;"></iframe>
                </div>
                <div class="modal-footer">
                    <button id="saveReportBtn" class="btn btn-primary">保存</button>
                    <button id="printReportBtn" class="btn btn-secondary">印刷</button>
                    <button id="exportPdfBtn" class="btn btn-secondary">PDF出力</button>
                    <button class="btn btn-cancel">閉じる</button>
                </div>
            </div>
        `;

        // 閉じるボタンのイベント
        modal.querySelector('.close-btn').addEventListener('click', () => {
            modal.remove();
        });

        modal.querySelector('.btn-cancel').addEventListener('click', () => {
            modal.remove();
        });

        modal.querySelector('.modal-overlay').addEventListener('click', () => {
            modal.remove();
        });

        return modal;
    }

    /**
     * レポート保存
     */
    async saveReport(data) {
        try {
            const response = await fetch('/api/save-kyotaku-report', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    patient_id: data.patient_id,
                    report_data: data,
                    generated_date: new Date().toISOString()
                })
            });

            if (response.ok) {
                this.showNotification('居宅療養管理指導書を保存しました', 'success');
                // 保存後にDocumentsテーブルに登録
                await this.registerToDocuments(data);
            } else {
                throw new Error('保存に失敗しました');
            }
        } catch (error) {
            console.error('保存エラー:', error);
            this.showNotification(`保存エラー: ${error.message}`, 'error');
        }
    }

    /**
     * Documentsテーブルへの登録
     */
    async registerToDocuments(data) {
        const fileName = `居宅療養管理指導書_${data.patient_name}_${new Date().toISOString().split('T')[0]}.pdf`;
        const filePath = `C:\\Users\\hyosh\\Desktop\\allright\\ageagekun\\patients\\${data.patient_id}\\${fileName}`;

        try {
            const response = await fetch('/api/register-document', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    fileName: fileName,
                    patientID: data.patient_id,
                    Category: '居宅',
                    FileType: 'PDF',
                    pass: filePath,
                    base_dir: `C:\\Users\\hyosh\\Desktop\\allright\\ageagekun\\patients\\${data.patient_id}`
                })
            });

            if (!response.ok) {
                console.error('Documents登録エラー');
            }
        } catch (error) {
            console.error('Documents登録エラー:', error);
        }
    }

    /**
     * PDF出力（要ライブラリ）
     */
    async exportToPDF(htmlContent, patientName) {
        // html2pdfやjsPDFを使用した実装が必要
        console.log('PDF出力機能は追加ライブラリが必要です');
        this.showNotification('PDF出力機能は準備中です', 'info');
    }

    /**
     * ローディングオーバーレイ表示
     */
    showLoadingOverlay(show) {
        let overlay = document.querySelector('.kyotaku-loading-overlay');

        if (show) {
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.className = 'kyotaku-loading-overlay';
                overlay.innerHTML = `
                    <div class="loading-spinner"></div>
                    <div class="loading-text">AI生成中...</div>
                `;
                document.body.appendChild(overlay);
            }
            overlay.style.display = 'flex';
        } else {
            if (overlay) {
                overlay.style.display = 'none';
            }
        }
    }

    /**
     * 通知表示
     */
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `kyotaku-notification ${type}`;
        notification.textContent = message;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.classList.add('show');
        }, 10);

        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    /**
     * 年齢計算
     */
    calculateAge(birthdate) {
        const birth = new Date(birthdate);
        const today = new Date();
        let age = today.getFullYear() - birth.getFullYear();
        const monthDiff = today.getMonth() - birth.getMonth();

        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
            age--;
        }

        return age;
    }

    /**
     * 日付フォーマット
     */
    formatDate(date) {
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const day = date.getDate();
        return `${year}年${month}月${day}日`;
    }

    /**
     * イベントリスナー設定
     */
    setupEventListeners() {
        // 生成ボタンのクリックイベントなどを設定
        document.addEventListener('click', (e) => {
            if (e.target.matches('.generate-kyotaku-btn')) {
                const patientId = e.target.dataset.patientId;
                this.handleGenerateClick(patientId);
            }
        });
    }

    /**
     * 生成ボタンクリック処理
     */
    async handleGenerateClick(patientId) {
        try {
            // 患者データ取得
            const patientData = await this.fetchPatientData(patientId);

            // カルテデータ取得
            const karteContent = await this.fetchKarteContent(patientId);

            // AI生成実行
            await this.generateReport(patientData, karteContent);

        } catch (error) {
            console.error('生成処理エラー:', error);
            this.showNotification(`エラー: ${error.message}`, 'error');
        }
    }

    /**
     * 患者データ取得
     */
    async fetchPatientData(patientId) {
        const response = await fetch(`/api/patients/${patientId}`);
        if (!response.ok) {
            throw new Error('患者データの取得に失敗しました');
        }
        return await response.json();
    }

    /**
     * カルテ内容取得
     */
    async fetchKarteContent(patientId) {
        const response = await fetch(`/api/karte/${patientId}/latest`);
        if (!response.ok) {
            throw new Error('カルテデータの取得に失敗しました');
        }
        const data = await response.json();
        return data.content || '';
    }
}

// モジュールエクスポート
window.KyotakuAIGenerator = KyotakuAIGenerator;

// 自動初期化
document.addEventListener('DOMContentLoaded', () => {
    window.kyotakuGenerator = new KyotakuAIGenerator();
    window.kyotakuGenerator.init();
});