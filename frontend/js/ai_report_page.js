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
        const generateBtn = document.getElementById('generateBtn');

        if (prevBtn) {
            prevBtn.addEventListener('click', () => this.goToPreviousStep());
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => this.goToNextStep());
        }

        if (generateBtn) {
            generateBtn.addEventListener('click', () => this.generateReport());
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
        if (this.currentStep < 3) {
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
        const generateBtn = document.getElementById('generateBtn');

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

        if (generateBtn) {
            generateBtn.style.display = this.currentStep === 3 ? 'block' : 'none';
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
                // ステップ3に移動してAI抽出結果を表示
                this.currentStep = 3;
                this.updateStepDisplay();
            }

        } catch (error) {
            console.error('AI生成エラー:', error);
            this.showToast('AI抽出に失敗しました', 'error');
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
     */
    async generateReport() {
        if (!this.selectedPatient) {
            this.showToast('患者を選択してください', 'error');
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
            return;
        }

        this.showToast('報告書の生成が完了しました！', 'success');

        // 生成された報告書を新しいタブで開く（LocalStorageのみ使用、URLパラメータなし）
        const reportUrl = `${window.location.protocol}//${window.location.host}/templates/kyotaku_report_template.html`;
        console.log('[ai_report_page.js] 報告書URLを開きます（patientIdパラメータなし）:', reportUrl);
        window.open(reportUrl, '_blank');
    }

    /**
     * 最終レポートデータの収集
     */
    collectFinalReportData() {
        const data = this.collectFormData();

        // AI生成した診療内容と生活指導を追加
        if (this.aiGeneratedMedicalContent) {
            data.medicalContent = this.aiGeneratedMedicalContent;
        }
        if (this.aiGeneratedAdviceText) {
            data.adviceText = this.aiGeneratedAdviceText;
        }

        // AI選択したアドバイスカテゴリーを配列として追加
        if (this.aiSelectedAdvice) {
            // 単一のアドバイスを配列に変換
            data.advices = [this.aiSelectedAdvice];
            console.log('報告書に含めるアドバイス:', data.advices);
        }

        // ステップ3のフィールド値を追加
        data.careLevel = document.getElementById('careLevel')?.value || '';
        data.primaryDisease = document.getElementById('primaryDisease')?.value || '';
        data.examDate = document.getElementById('examDate')?.value || '';
        data.nextExamDate = document.getElementById('nextExamDate')?.value || '';

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
        } else {
            // YYYY-MM-DD形式をYYYY年MM月DD日形式に変換
            const examDate = new Date(data.examDate);
            data.examDate = `${examDate.getFullYear()}年${examDate.getMonth() + 1}月${examDate.getDate()}日`;
        }

        // 次回診察日のフォーマット
        if (data.nextExamDate) {
            const nextDate = new Date(data.nextExamDate);
            data.nextExamDate = `${nextDate.getFullYear()}年${nextDate.getMonth() + 1}月${nextDate.getDate()}日`;
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

        // デバッグ: officeAddressの値を確認
        console.log('収集したofficeAddress:', data.officeAddress);
        console.log('全収集データ:', data);

        return data;
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
                // AI生成結果をフォームに自動入力
                this.fillFormWithAIData(result.data);
                return result.data;
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
     * AI生成データをフォームに入力
     */
    fillFormWithAIData(aiData) {
        // 介護度の設定
        if (aiData.care_level) {
            const careLevelField = document.getElementById('careLevel');
            if (careLevelField) {
                careLevelField.value = aiData.care_level;
                this.highlightField(careLevelField);
            }
        }

        // 主病名の設定
        if (aiData.primary_disease) {
            const diseaseField = document.getElementById('primaryDisease');
            if (diseaseField) {
                diseaseField.value = aiData.primary_disease;
                this.highlightField(diseaseField);
            }
        }

        // 診察日の設定
        if (aiData.exam_date) {
            const examDateField = document.getElementById('examDate');
            if (examDateField) {
                // 日付形式を変換（YYYY/MM/DD → YYYY-MM-DD）
                const formattedDate = aiData.exam_date.replace(/\//g, '-');
                examDateField.value = formattedDate;
                this.highlightField(examDateField);
            }
        }

        // 次回診察日の設定
        if (aiData.next_exam_date) {
            const nextExamField = document.getElementById('nextExamDate');
            if (nextExamField) {
                const formattedDate = aiData.next_exam_date.replace(/\//g, '-');
                nextExamField.value = formattedDate;
                this.highlightField(nextExamField);
            }
        }

        // 診療内容の設定（別フィールドに保存）
        if (aiData.medical_content) {
            // 診療内容を保存（レポート生成時に使用）
            this.aiGeneratedMedicalContent = aiData.medical_content;
        }

        // 生活指導の設定（別フィールドに保存）
        if (aiData.advice_text) {
            this.aiGeneratedAdviceText = aiData.advice_text;
        }

        // 選択されたアドバイスカテゴリーを保存
        if (aiData.selected_advice) {
            this.aiSelectedAdvice = aiData.selected_advice;
            console.log('AI選択したアドバイス:', this.aiSelectedAdvice);
        }

        this.showToast('AI抽出が完了しました。内容を確認してください', 'success');
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