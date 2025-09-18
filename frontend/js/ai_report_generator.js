/**
 * AI報告書生成モジュール
 */
class AIReportGenerator {
    constructor() {
        this.selectedPatient = null;
        this.currentStep = 1;
        this.allPatients = [];
        this.filteredPatients = [];
        this.init();
    }

    init() {
        this.createModal();
        this.setupEventListeners();
    }

    /**
     * モーダルHTML生成
     */
    createModal() {
        const modalHTML = `
            <div class="ai-modal" id="aiModal">
                <div class="ai-modal-content">
                    <div class="ai-modal-header">
                        <button class="ai-modal-close" id="aiModalClose">✕</button>
                        <h2 class="ai-modal-title">AI 居宅療養管理指導報告書作成</h2>
                    </div>

                    <div class="ai-modal-body">
                        <!-- ステップインジケーター -->
                        <div class="ai-steps">
                            <div class="ai-step active" data-step="1">
                                <div class="ai-step-number">1</div>
                                <div class="ai-step-label">患者選択</div>
                            </div>
                            <div class="ai-step" data-step="2">
                                <div class="ai-step-number">2</div>
                                <div class="ai-step-label">カルテ入力</div>
                            </div>
                            <div class="ai-step" data-step="3">
                                <div class="ai-step-number">3</div>
                                <div class="ai-step-label">追加情報</div>
                            </div>
                        </div>

                        <!-- ステップ1: 患者選択 -->
                        <div class="ai-step-content active" id="step1">
                            <h3>患者を選択してください</h3>
                            <div class="patient-search-container">
                                <input type="text"
                                       class="patient-search-input"
                                       id="patientSearchInput"
                                       placeholder="🔍 患者名、患者ID、ケアマネージャー名で検索...">
                            </div>
                            <div class="patient-select-grid" id="patientGrid">
                                <!-- 動的に患者リストを読み込み -->
                            </div>
                        </div>

                        <!-- ステップ2: カルテ入力 -->
                        <div class="ai-step-content" id="step2">
                            <h3>カルテ内容を入力してください</h3>
                            <div class="karte-info">
                                <div class="karte-info-title">選択された患者</div>
                                <div class="karte-info-text" id="selectedPatientInfo">-</div>
                            </div>
                            <div class="karte-input-container">
                                <textarea
                                    class="karte-textarea"
                                    id="karteContent"
                                    placeholder="カルテ内容を貼り付けてください。&#10;&#10;例:&#10;2024/1/15 訪問診療&#10;BP 135/82, P 72, BT 36.5&#10;HbA1c 7.2% (前回7.5%)&#10;血糖値 142mg/dl&#10;膝痛(-)、歩行安定&#10;処方継続：メトホルミン500mg 1T/1x朝"
                                ></textarea>
                                <div style="margin-top: 10px; font-size: 12px; color: #666;">
                                    ※ バイタルサイン、検査値、症状、処方内容などを含めてください
                                </div>
                            </div>
                        </div>

                        <!-- ステップ3: 追加情報 -->
                        <div class="ai-step-content" id="step3">
                            <h3>追加情報（任意）</h3>
                            <div class="additional-info">
                                <div class="form-group">
                                    <label class="form-label">介護度</label>
                                    <input type="text" class="form-input" id="careLevel" placeholder="例: 要介護3">
                                </div>
                                <div class="form-group">
                                    <label class="form-label">主病名</label>
                                    <input type="text" class="form-input" id="primaryDisease" placeholder="例: 高血圧症、糖尿病">
                                </div>
                                <div class="form-group">
                                    <label class="form-label">次回診察日</label>
                                    <input type="date" class="form-input" id="nextExamDate">
                                </div>
                                <div class="form-group">
                                    <label class="form-label">医師名</label>
                                    <input type="text" class="form-input" id="doctorName" value="たすくホームクリニック医師">
                                </div>
                            </div>
                        </div>

                        <!-- ローディング -->
                        <div class="ai-loading" id="aiLoading">
                            <div class="ai-loading-spinner"></div>
                            <div class="ai-loading-text">AI生成中...</div>
                        </div>

                        <!-- エラー表示 -->
                        <div class="ai-error" id="aiError"></div>

                        <!-- 成功メッセージ -->
                        <div class="ai-success" id="aiSuccess"></div>
                    </div>

                    <div class="ai-modal-footer">
                        <div id="stepIndicator">ステップ 1 / 3</div>
                        <div class="ai-modal-buttons">
                            <button class="btn-prev" id="btnPrev" style="display: none;">前へ</button>
                            <button class="btn-next" id="btnNext">次へ</button>
                            <button class="btn-generate" id="btnGenerate" style="display: none;">生成</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // モーダルをbodyに追加
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }

    /**
     * イベントリスナー設定
     */
    setupEventListeners() {
        // AI作成ボタン
        const aiBtn = document.getElementById('aiGenerateBtn');
        if (aiBtn) {
            aiBtn.addEventListener('click', () => this.openModal());
        }

        // モーダル閉じるボタン
        document.getElementById('aiModalClose').addEventListener('click', () => this.closeModal());

        // モーダル外クリック
        document.getElementById('aiModal').addEventListener('click', (e) => {
            if (e.target.id === 'aiModal') {
                this.closeModal();
            }
        });

        // ナビゲーションボタン
        document.getElementById('btnNext').addEventListener('click', () => this.nextStep());
        document.getElementById('btnPrev').addEventListener('click', () => this.prevStep());
        document.getElementById('btnGenerate').addEventListener('click', () => this.generateReport());

        // 検索入力イベント（モーダル作成後に設定）
        setTimeout(() => {
            const searchInput = document.getElementById('patientSearchInput');
            if (searchInput) {
                searchInput.addEventListener('input', (e) => this.filterPatients(e.target.value));
            }
        }, 100);
    }

    /**
     * モーダルを開く
     */
    async openModal() {
        const modal = document.getElementById('aiModal');
        modal.classList.add('show');
        this.currentStep = 1;
        this.updateStepDisplay();
        await this.loadPatients();
    }

    /**
     * モーダルを閉じる
     */
    closeModal() {
        const modal = document.getElementById('aiModal');
        modal.classList.remove('show');
        this.resetForm();
    }

    /**
     * 患者リスト読み込み
     */
    async loadPatients() {
        const grid = document.getElementById('patientGrid');
        grid.innerHTML = '<div>読み込み中...</div>';

        try {
            const response = await fetch('http://localhost:3000/api/patients/all');
            const data = await response.json();

            if (data.success) {
                // 全患者データを保存
                this.allPatients = data.patients;
                this.filteredPatients = [...this.allPatients];

                // 患者カードを表示
                this.displayPatients(this.filteredPatients);
            }
        } catch (error) {
            console.error('患者リスト読み込みエラー:', error);
            grid.innerHTML = '<div style="color: red;">患者リストの読み込みに失敗しました</div>';
        }
    }

    /**
     * 患者カードを表示
     */
    displayPatients(patients) {
        const grid = document.getElementById('patientGrid');
        grid.innerHTML = '';

        if (patients.length === 0) {
            grid.innerHTML = '<div style="text-align: center; color: #666; padding: 20px;">該当する患者が見つかりません</div>';
            return;
        }

        patients.forEach(patient => {
            const card = document.createElement('div');
            card.className = 'patient-card';
            card.dataset.patientId = patient.patientid;

            // 生年月日をフォーマット
            const birthdate = new Date(patient.birthdate);
            const formattedDate = `${birthdate.getFullYear()}年${birthdate.getMonth() + 1}月${birthdate.getDate()}日`;

            card.innerHTML = `
                <div class="patient-card-name">${patient.patientname || '名前未設定'}</div>
                <div class="patient-card-info">
                    <span>ID: ${patient.patientid}</span>
                    <span>${formattedDate}</span>
                    ${patient.cmname ? `<span>CM: ${patient.cmname}</span>` : ''}
                </div>
            `;

            card.addEventListener('click', () => this.selectPatient(patient));
            grid.appendChild(card);
        });
    }

    /**
     * 患者をフィルタリング
     */
    filterPatients(searchTerm) {
        const term = searchTerm.toLowerCase().trim();

        if (!term) {
            this.filteredPatients = [...this.allPatients];
        } else {
            this.filteredPatients = this.allPatients.filter(patient => {
                const patientName = (patient.patientname || '').toLowerCase();
                const patientId = String(patient.patientid);
                const cmName = (patient.cmname || '').toLowerCase();
                const address = (patient.address || '').toLowerCase();

                return patientName.includes(term) ||
                       patientId.includes(term) ||
                       cmName.includes(term) ||
                       address.includes(term);
            });
        }

        this.displayPatients(this.filteredPatients);
    }

    /**
     * 患者選択
     */
    selectPatient(patient) {
        // 選択状態をクリア
        document.querySelectorAll('.patient-card').forEach(card => {
            card.classList.remove('selected');
        });

        // 選択状態を設定
        const selectedCard = document.querySelector(`[data-patient-id="${patient.patientid}"]`);
        if (selectedCard) {
            selectedCard.classList.add('selected');
        }

        this.selectedPatient = patient;

        // 患者情報を表示
        const birthdate = new Date(patient.birthdate);
        const age = this.calculateAge(birthdate);
        document.getElementById('selectedPatientInfo').textContent =
            `${patient.patientname} 様（${age}歳）`;
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
     * 次のステップへ
     */
    nextStep() {
        if (this.currentStep === 1 && !this.selectedPatient) {
            this.showError('患者を選択してください');
            return;
        }

        if (this.currentStep === 2 && !document.getElementById('karteContent').value.trim()) {
            this.showError('カルテ内容を入力してください');
            return;
        }

        if (this.currentStep < 3) {
            this.currentStep++;
            this.updateStepDisplay();
        }
    }

    /**
     * 前のステップへ
     */
    prevStep() {
        if (this.currentStep > 1) {
            this.currentStep--;
            this.updateStepDisplay();
        }
    }

    /**
     * ステップ表示更新
     */
    updateStepDisplay() {
        // ステップインジケーター更新
        document.querySelectorAll('.ai-step').forEach(step => {
            const stepNum = parseInt(step.dataset.step);
            step.classList.remove('active', 'completed');
            if (stepNum === this.currentStep) {
                step.classList.add('active');
            } else if (stepNum < this.currentStep) {
                step.classList.add('completed');
            }
        });

        // コンテンツ表示切替
        document.querySelectorAll('.ai-step-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`step${this.currentStep}`).classList.add('active');

        // ボタン表示制御
        document.getElementById('btnPrev').style.display = this.currentStep === 1 ? 'none' : 'block';
        document.getElementById('btnNext').style.display = this.currentStep === 3 ? 'none' : 'block';
        document.getElementById('btnGenerate').style.display = this.currentStep === 3 ? 'block' : 'none';

        // ステップ表示
        document.getElementById('stepIndicator').textContent = `ステップ ${this.currentStep} / 3`;

        // エラーをクリア
        this.hideError();
    }

    /**
     * 報告書生成
     */
    async generateReport() {
        const karteContent = document.getElementById('karteContent').value.trim();

        if (!karteContent) {
            this.showError('カルテ内容を入力してください');
            return;
        }

        // ローディング表示
        document.getElementById('aiLoading').classList.add('show');
        this.hideError();

        try {
            // APIリクエスト
            const response = await fetch('http://localhost:3000/api/ai/generate-kyotaku-report', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    patient_id: this.selectedPatient.patientid,
                    karte_content: karteContent
                })
            });

            const result = await response.json();

            if (result.success) {
                // 追加情報を含める
                const reportData = {
                    ...result.data,
                    care_level: document.getElementById('careLevel').value || result.data.care_level,
                    primary_disease: document.getElementById('primaryDisease').value || result.data.primary_disease,
                    next_exam_date: this.formatDate(document.getElementById('nextExamDate').value) || result.data.next_exam_date,
                    doctor_name: document.getElementById('doctorName').value || result.data.doctor_name
                };

                // レポートを表示
                this.displayReport(reportData);

                // 成功メッセージ
                document.getElementById('aiSuccess').textContent = '報告書が生成されました！';
                document.getElementById('aiSuccess').classList.add('show');

                // 3秒後にモーダルを閉じて報告書を開く
                setTimeout(() => {
                    this.closeModal();
                    this.openReportPreview(reportData);
                }, 2000);

            } else {
                throw new Error(result.error || '生成に失敗しました');
            }

        } catch (error) {
            console.error('生成エラー:', error);
            this.showError('報告書の生成に失敗しました: ' + error.message);
        } finally {
            document.getElementById('aiLoading').classList.remove('show');
        }
    }

    /**
     * 日付フォーマット
     */
    formatDate(dateStr) {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
    }

    /**
     * レポート表示（テンプレートに反映）
     */
    displayReport(reportData) {
        // ローカルストレージに保存
        localStorage.setItem('kyotakuReportData', JSON.stringify(reportData));
    }

    /**
     * レポートプレビュー開く
     */
    openReportPreview(reportData) {
        // 新しいウィンドウでテンプレートを開く
        const previewWindow = window.open('/templates/kyotaku_report_template.html', '_blank');

        // データを適用
        previewWindow.addEventListener('load', () => {
            if (previewWindow.KyotakuReportTemplate) {
                previewWindow.KyotakuReportTemplate.applyData(reportData);
            }
        });
    }

    /**
     * エラー表示
     */
    showError(message) {
        const errorEl = document.getElementById('aiError');
        errorEl.textContent = message;
        errorEl.classList.add('show');
    }

    /**
     * エラー非表示
     */
    hideError() {
        const errorEl = document.getElementById('aiError');
        errorEl.classList.remove('show');
    }

    /**
     * フォームリセット
     */
    resetForm() {
        this.selectedPatient = null;
        this.currentStep = 1;
        this.allPatients = [];
        this.filteredPatients = [];

        // 検索入力をクリア
        const searchInput = document.getElementById('patientSearchInput');
        if (searchInput) {
            searchInput.value = '';
        }

        document.getElementById('karteContent').value = '';
        document.getElementById('careLevel').value = '';
        document.getElementById('primaryDisease').value = '';
        document.getElementById('nextExamDate').value = '';
        document.getElementById('doctorName').value = 'たすくホームクリニック医師';
        document.querySelectorAll('.patient-card').forEach(card => {
            card.classList.remove('selected');
        });
        this.hideError();
        document.getElementById('aiSuccess').classList.remove('show');
    }
}

// 初期化
document.addEventListener('DOMContentLoaded', () => {
    window.aiReportGenerator = new AIReportGenerator();
});