/**
 * AI報告書作成ページ専用スクリプト
 */
class AIReportPage {
    constructor() {
        this.selectedPatient = null;
        this.patientData = null;
        this.currentStep = 1;
        this.allPatients = [];
        this.filteredPatients = [];
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadPatients();
    }

    /**
     * イベントリスナーの設定
     */
    setupEventListeners() {
        // ステップ間ナビゲーション
        const prevBtn = document.getElementById('prevBtn');
        const nextBtn = document.getElementById('nextBtn');

        if (prevBtn) {
            prevBtn.addEventListener('click', () => this.goToPreviousStep());
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => this.goToNextStep());
        }

        // AI生成ボタン（ステップ2内）
        const aiGenerateBtn = document.getElementById('aiGenerateBtn');
        if (aiGenerateBtn) {
            aiGenerateBtn.addEventListener('click', () => this.handleAIGeneration());
        }

        // 患者検索
        const searchInput = document.getElementById('patientSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => this.searchPatients(e.target.value));
        }

        // カルテ内容の入力監視
        const karteContent = document.getElementById('karteContent');
        if (karteContent) {
            karteContent.addEventListener('input', () => this.validateStep2());
        }
    }

    /**
     * 患者リストの読み込み
     */
    async loadPatients() {
        const patientGrid = document.getElementById('patientGrid');
        if (!patientGrid) return;

        try {
            patientGrid.innerHTML = `
                <div class="loading">
                    <div class="loading__spinner"></div>
                    <div class="loading__text">患者リストを読み込み中...</div>
                </div>
            `;

            // APIから患者データを取得
            const response = await fetch('http://localhost:3000/api/patients/all');
            if (!response.ok) throw new Error('患者データの取得に失敗しました');

            const data = await response.json();
            const patients = data.patients || [];
            this.allPatients = patients;
            this.filteredPatients = patients;

            this.displayPatients(patients);
        } catch (error) {
            console.error('患者リスト読み込みエラー:', error);
            patientGrid.innerHTML = `
                <div class="error-message">
                    患者リストの読み込みに失敗しました。
                    <br>
                    <button class="btn btn--secondary btn--small" onclick="location.reload()">再試行</button>
                </div>
            `;
        }
    }

    /**
     * 患者リストの表示
     */
    displayPatients(patients) {
        const patientGrid = document.getElementById('patientGrid');
        if (!patientGrid) return;

        if (patients.length === 0) {
            patientGrid.innerHTML = '<div class="no-patients">患者が見つかりませんでした</div>';
            return;
        }

        patientGrid.innerHTML = patients.map(patient => `
            <div class="patient-card" data-patient-id="${patient.patientid}">
                <span class="patient-id">ID: ${patient.patientid}</span>
                <span class="patient-name">${patient.patientname || '未設定'}</span>
            </div>
        `).join('');

        // 患者カード全体をクリック可能にする
        document.querySelectorAll('.patient-card').forEach(card => {
            card.addEventListener('click', () => {
                // 既存の選択を解除
                document.querySelectorAll('.patient-card').forEach(c => c.classList.remove('selected'));

                // 現在のカードを選択状態にする
                card.classList.add('selected');

                // 患者データを取得
                const patientId = card.dataset.patientId;
                const patient = this.allPatients.find(p => p.patientid === parseInt(patientId));
                if (patient) {
                    this.selectPatient(patient);
                } else {
                    console.error('Patient not found:', patientId);
                }
            });
        });
    }

    /**
     * 患者の検索
     */
    searchPatients(query) {
        const normalizedQuery = query.toLowerCase();

        if (!normalizedQuery) {
            this.filteredPatients = this.allPatients;
        } else {
            this.filteredPatients = this.allPatients.filter(patient => {
                return (
                    patient.patientname?.toLowerCase().includes(normalizedQuery) ||
                    patient.patientid?.toString().includes(normalizedQuery) ||
                    patient.cm_name?.toLowerCase().includes(normalizedQuery) ||
                    patient.office_name?.toLowerCase().includes(normalizedQuery) ||
                    patient.vns_name?.toLowerCase().includes(normalizedQuery)
                );
            });
        }

        this.displayPatients(this.filteredPatients);
    }

    /**
     * 患者の選択
     */
    async selectPatient(patient) {
        this.selectedPatient = patient;

        // 次のステップへボタンを有効化
        const nextBtn = document.getElementById('nextBtn');
        if (nextBtn) {
            nextBtn.disabled = false;
        }

        // 患者の詳細データを取得してフォームに設定
        try {
            const response = await fetch(`http://localhost:3000/api/patients/${patient.patientid}`);
            if (response.ok) {
                const data = await response.json();
                if (data.success && data.patient) {
                    this.patientData = data.patient;
                }
            }
        } catch (error) {
            console.error('患者詳細の取得エラー:', error);
        }
    }

    /**
     * ステップ2の検証
     */
    validateStep2() {
        const karteContent = document.getElementById('karteContent');
        const aiGenerateBtn = document.getElementById('aiGenerateBtn');

        if (karteContent && aiGenerateBtn) {
            // カルテ内容が10文字以上入力されたらAI生成ボタンを有効化
            aiGenerateBtn.disabled = karteContent.value.trim().length < 10;
        }
    }

    /**
     * 前のステップへ
     */
    goToPreviousStep() {
        if (this.currentStep > 1) {
            this.currentStep--;
            this.updateStepDisplay();
        }
    }

    /**
     * 次のステップへ
     */
    goToNextStep() {
        if (this.currentStep < 2) {
            this.currentStep++;
            this.updateStepDisplay();
        }
    }

    /**
     * ステップ表示の更新
     */
    updateStepDisplay() {
        // ステップインジケーターの更新
        document.querySelectorAll('.ai-step').forEach((step, index) => {
            if (index + 1 <= this.currentStep) {
                step.classList.add('active');
            } else {
                step.classList.remove('active');
            }
        });

        // ステップコンテンツの表示/非表示
        document.querySelectorAll('.ai-step-content').forEach((content, index) => {
            if (index + 1 === this.currentStep) {
                content.classList.add('active');
            } else {
                content.classList.remove('active');
            }
        });

        // ボタンの表示/非表示
        const prevBtn = document.getElementById('prevBtn');
        const nextBtn = document.getElementById('nextBtn');

        if (prevBtn) {
            prevBtn.style.display = this.currentStep > 1 ? 'block' : 'none';
        }

        if (nextBtn) {
            // ステップ2では次へボタンを非表示（AI生成ボタンがあるため）
            nextBtn.style.display = this.currentStep === 1 ? 'block' : 'none';
            if (this.currentStep === 2) {
                // ステップ2に移動した時にデータをフォームに設定
                this.populateStep2Data();
                this.validateStep2();
            }
        }
    }

    /**
     * ステップ2のフォームにデータを設定
     */
    populateStep2Data() {
        if (!this.selectedPatient) return;

        const patient = this.patientData || this.selectedPatient;

        // 患者基本情報
        this.setFieldValue('patientId', patient.patientid);
        this.setFieldValue('patientName', patient.patientname);
        if (patient.birthdate) {
            const birthdate = new Date(patient.birthdate);
            this.setFieldValue('birthdate', birthdate.toISOString().split('T')[0]);
            this.setFieldValue('age', this.calculateAge(birthdate));
        }
        this.setFieldValue('address', patient.address);

        // 医療関係者情報
        this.setFieldValue('cmName', patient.cm_name);
        this.setFieldValue('officeName', patient.office_name);
        this.setFieldValue('officeAddress', patient.office_address);

        // 生年月日変更時の年齢自動計算
        const birthdateInput = document.getElementById('birthdate');
        if (birthdateInput) {
            birthdateInput.addEventListener('change', (e) => {
                const age = this.calculateAge(new Date(e.target.value));
                this.setFieldValue('age', age);
            });
        }

        // AI生成ボタンの初期状態を設定（カルテ内容が空の場合はdisabled）
        setTimeout(() => {
            this.validateStep2();
        }, 100);
    }

    /**
     * フィールドに値を設定
     */
    setFieldValue(id, value) {
        const field = document.getElementById(id);
        if (field) {
            field.value = value || '';
        }
    }

    /**
     * 年齢計算
     */
    calculateAge(birthdate) {
        const today = new Date();
        let age = today.getFullYear() - birthdate.getFullYear();
        const monthDiff = today.getMonth() - birthdate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthdate.getDate())) {
            age--;
        }
        return age;
    }

    /**
     * AI生成処理（ステップ2から呼ばれる）
     */
    async handleAIGeneration() {
        if (!this.selectedPatient) {
            this.showToast('患者を選択してください', 'error');
            return;
        }

        const karteContent = document.getElementById('karteContent').value;
        if (!karteContent) {
            this.showToast('カルテ内容を入力してください', 'error');
            return;
        }

        // フォームからすべてのデータを収集
        const reportData = this.collectFormData();

        // 最初に新しいタブを開く（同期的に実行してポップアップブロッカーを回避）
        const reportWindow = window.open('about:blank', '_blank');
        if (!reportWindow) {
            this.showToast('ポップアップがブロックされています。ポップアップを許可してください。', 'error');
            return;
        }

        // ローディング画面を表示
        reportWindow.document.write(`
            <!DOCTYPE html>
            <html lang="ja">
            <head>
                <meta charset="UTF-8">
                <title>報告書生成中...</title>
                <style>
                    body {
                        font-family: 'Yu Gothic', 'YuGothic', sans-serif;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        height: 100vh;
                        margin: 0;
                        background: #f5f5f5;
                    }
                    .loading {
                        text-align: center;
                    }
                    .loading h1 {
                        color: #333;
                        font-size: 24px;
                        margin-bottom: 20px;
                    }
                    .spinner {
                        border: 3px solid #f3f3f3;
                        border-top: 3px solid #3498db;
                        border-radius: 50%;
                        width: 40px;
                        height: 40px;
                        animation: spin 1s linear infinite;
                        margin: 0 auto;
                    }
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                </style>
            </head>
            <body>
                <div class="loading">
                    <h1>報告書を生成中...</h1>
                    <div class="spinner"></div>
                    <p>しばらくお待ちください</p>
                </div>
            </body>
            </html>
        `);
        reportWindow.document.close();

        const generatingIndicator = document.getElementById('generatingIndicator');
        const aiGenerateBtn = document.getElementById('aiGenerateBtn');

        if (generatingIndicator) {
            generatingIndicator.style.display = 'block';
        }
        if (aiGenerateBtn) {
            aiGenerateBtn.disabled = true;
        }

        try {
            // AI APIを呼び出して情報を抽出
            const aiData = await this.callAIAPI(reportData);

            if (aiData) {
                // AI生成結果を保持（structuredCloneで確実にコピー）
                this.aiGeneratedData = typeof structuredClone !== 'undefined' ?
                    structuredClone(aiData) :
                    JSON.parse(JSON.stringify(aiData));

                // 直接報告書を生成（ウィンドウ参照を渡す）
                await this.generateReport(reportWindow);
            } else {
                // AIデータがない場合はウィンドウを閉じる
                reportWindow.close();
                this.showToast('AI生成に失敗しました', 'error');
            }

        } catch (error) {
            console.error('AI生成エラー:', error);
            // エラー時はウィンドウを閉じる
            reportWindow.close();
            this.showToast('AI生成に失敗しました', 'error');
        } finally {
            if (generatingIndicator) {
                generatingIndicator.style.display = 'none';
            }
            if (aiGenerateBtn) {
                aiGenerateBtn.disabled = false;
            }
        }
    }

    /**
     * 報告書の生成（最終処理）
     * @param {Window} reportWindow - 既に開いているウィンドウの参照（オプション）
     */
    async generateReport(reportWindow = null) {
        if (!this.selectedPatient) {
            this.showToast('患者を選択してください', 'error');
            if (reportWindow) reportWindow.close();
            return;
        }

        // 全データを収集（AI生成データとユーザー編集データを統合）
        const finalData = this.collectFinalReportData();

        // LocalStorageに報告書データを保存
        try {
            // デバッグ: officeAddressの存在確認
            console.log('最終データのofficeAddress:', finalData.officeAddress);

            localStorage.setItem('kyotakuReportData', JSON.stringify(finalData));
            console.log('報告書データをLocalStorageに保存しました:', finalData);
        } catch (error) {
            console.error('LocalStorage保存エラー:', error);
            this.showToast('データの保存に失敗しました', 'error');
            if (reportWindow) reportWindow.close();
            return;
        }

        this.showToast('報告書の生成が完了しました！', 'success');

        // 生成された報告書を新しいタブで開く（LocalStorageのみ使用、URLパラメータなし）
        const reportUrl = `${window.location.protocol}//${window.location.host}/templates/kyotaku_report_template.html`;
        console.log('[ai_report_page.js] 報告書URLを開きます（patientIdパラメータなし）:', reportUrl);

        if (reportWindow) {
            // 既存のウィンドウにナビゲート
            reportWindow.location.href = reportUrl;
        } else {
            // フォールバック：新しいウィンドウを開く
            window.open(reportUrl, '_blank');
        }
    }

    /**
     * 最終レポートデータの収集
     */
    collectFinalReportData() {
        const data = this.collectFormData();

        // AI生成データがある場合はそれを使用
        if (this.aiGeneratedData) {
            // AI生成した診療内容と生活指導を追加
            if (this.aiGeneratedData.medical_content) {
                data.medicalContent = this.aiGeneratedData.medical_content;
            }
            if (this.aiGeneratedData.advice_text) {
                data.adviceText = this.aiGeneratedData.advice_text;
            }

            // AI選択したアドバイスカテゴリーを配列として追加
            if (this.aiGeneratedData.selected_advice) {
                data.advices = [this.aiGeneratedData.selected_advice];
                console.log('報告書に含めるアドバイス:', data.advices);
            }

            // AI抽出した情報を追加
            data.careLevel = this.aiGeneratedData.care_level || '';
            data.primaryDisease = this.aiGeneratedData.primary_disease || '';
            data.examDate = this.aiGeneratedData.exam_date || '';
            data.nextExamDate = this.aiGeneratedData.next_exam_date || '';
        } else {
            // AI生成データがない場合はデフォルト値
            data.careLevel = '';
            data.primaryDisease = '';
            data.examDate = '';
            data.nextExamDate = '';
        }

        // 報告書の期間情報を計算（今月の月初・月末）
        const today = new Date();
        const year = today.getFullYear();
        const month = today.getMonth() + 1;
        const lastDay = new Date(year, month, 0).getDate();
        data.periodStart = `${year}年${month}月1日`;
        data.periodEnd = `${year}年${month}月${lastDay}日`;

        // 診察日のフォーマット（もし空の場合は今日の日付）
        if (!data.examDate) {
            data.examDate = `${year}年${month}月${today.getDate()}日`;
        } else if (!data.examDate.includes('年')) {
            // YYYY/MM/DDまたはYYYY-MM-DD形式をYYYY年MM月DD日形式に変換
            const examDateStr = data.examDate.replace(/\//g, '-');
            const examDate = new Date(examDateStr);
            if (!isNaN(examDate.getTime())) {
                data.examDate = `${examDate.getFullYear()}年${examDate.getMonth() + 1}月${examDate.getDate()}日`;
            }
        }

        // 次回診察日のフォーマット
        if (data.nextExamDate && !data.nextExamDate.includes('年')) {
            const nextDateStr = data.nextExamDate.replace(/\//g, '-');
            const nextDate = new Date(nextDateStr);
            if (!isNaN(nextDate.getTime())) {
                data.nextExamDate = `${nextDate.getFullYear()}年${nextDate.getMonth() + 1}月${nextDate.getDate()}日`;
            }
        }

        return data;
    }

    /**
     * フォームデータを収集
     */
    collectFormData() {
        return {
            // 患者基本情報
            patientId: document.getElementById('patientId')?.value || '',
            patientName: document.getElementById('patientName')?.value || '',
            birthdate: document.getElementById('birthdate')?.value || '',
            age: document.getElementById('age')?.value || '',
            address: document.getElementById('address')?.value || '',

            // 医療関係者情報
            cmName: document.getElementById('cmName')?.value || '',
            officeName: document.getElementById('officeName')?.value || '',
            officeAddress: document.getElementById('officeAddress')?.value || '',
            doctorName: document.getElementById('doctorName')?.value || 'たすくホームクリニック医師',

            // カルテ内容（ここから診療情報を自動抽出）
            karteContent: document.getElementById('karteContent')?.value || ''
        };
    }

    /**
     * AI APIの呼び出し
     */
    async callAIAPI(reportData) {
        try {
            // AI APIエンドポイントに送信
            const response = await fetch('http://localhost:3000/api/ai/generate-kyotaku-report', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    patient_id: reportData.patientId,
                    karte_content: reportData.karteContent
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'AI APIの呼び出しに失敗しました');
            }

            const result = await response.json();

            if (result.success && result.data) {
                // structuredCloneでディープコピーを作成（参照による変更を防ぐ）
                const clonedData = typeof structuredClone !== 'undefined' ?
                    structuredClone(result.data) :
                    JSON.parse(JSON.stringify(result.data));

                // AI生成結果を保持
                this.fillFormWithAIData(clonedData);
                return clonedData;
            } else {
                throw new Error(result.error || 'AI生成に失敗しました');
            }
        } catch (error) {
            console.error('AI API Error:', error);
            // エラーでも処理を継続（手動入力を許可）
            this.showToast(`AI自動抽出エラー: ${error.message}\n手動で情報を入力してください`, 'warning');
            return null;
        }
    }

    /**
     * AI生成データを保持（フォーム入力は行わない）
     */
    fillFormWithAIData(aiData) {
        // AI生成データをクラスのプロパティとして保持
        this.aiGeneratedData = aiData;

        // デバッグ情報
        console.log('AI生成データを保持しました:', aiData);
        this.showToast('AI抽出が完了し、報告書を生成しています...', 'success');
    }

    /**
     * フィールドをハイライト表示
     */
    highlightField(field) {
        field.style.transition = 'background-color 0.3s ease';
        field.style.backgroundColor = '#e8f5e9';
        setTimeout(() => {
            field.style.backgroundColor = '';
        }, 2000);
    }

    /**
     * トースト通知の表示
     */
    showToast(message, type = 'info') {
        const toastContainer = document.getElementById('toastContainer');
        if (!toastContainer) return;

        const toast = document.createElement('div');
        toast.className = `toast toast--${type}`;
        toast.innerHTML = `
            <div class="toast__icon">
                ${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}
            </div>
            <div class="toast__message">${message}</div>
        `;

        toastContainer.appendChild(toast);

        // アニメーション後に削除
        setTimeout(() => {
            toast.classList.add('toast--fade-out');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

// ページ読み込み時に初期化
document.addEventListener('DOMContentLoaded', () => {
    new AIReportPage();
});