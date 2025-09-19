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
        this.filterSettings = {
            sort: 'name_asc',
            filter: '',
            category: ''
        };
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupTabListeners();
        // デフォルトは「カルテを貼り付けて始める」タブ
        this.currentTab = 'paste-karte';
        // 患者選択タブの時のみ患者リストを読み込み
        if (this.currentTab === 'select-patient') {
            this.loadPatients();
            this.loadCategories();
            this.initFilterControls();
        }
    }

    /**
     * タブ切り替えリスナーの設定
     */
    setupTabListeners() {
        const pasteKarteTab = document.getElementById('pasteKarteTab');
        const selectPatientTab = document.getElementById('selectPatientTab');
        const directKarteInput = document.getElementById('directKarteInput');
        const generateFromPaste = document.getElementById('generateFromPaste');

        // タブクリックイベント
        if (pasteKarteTab) {
            pasteKarteTab.addEventListener('click', () => this.switchTab('paste-karte'));
        }

        if (selectPatientTab) {
            selectPatientTab.addEventListener('click', () => this.switchTab('select-patient'));
        }

        // カルテ直接入力の監視
        if (directKarteInput) {
            directKarteInput.addEventListener('input', (e) => {
                // 10文字以上入力されたら生成ボタンを有効化
                if (generateFromPaste) {
                    generateFromPaste.disabled = e.target.value.trim().length < 10;
                }
            });
        }

        // カルテ直接入力からの生成ボタン
        if (generateFromPaste) {
            generateFromPaste.addEventListener('click', () => this.searchPatientFromKarte());
        }

        // Step2の確認ボタン
        const confirmPatientBtn = document.getElementById('confirmPatientBtn');
        if (confirmPatientBtn) {
            confirmPatientBtn.addEventListener('click', () => this.confirmPatientAndGenerate());
        }

        // Step2の戻るボタン
        const backToStep1Btn = document.getElementById('backToStep1Btn');
        if (backToStep1Btn) {
            backToStep1Btn.addEventListener('click', () => this.backToKarteInput());
        }
    }

    /**
     * タブ切り替え処理
     */
    switchTab(tabName) {
        this.currentTab = tabName;

        // タブボタンのアクティブ状態を更新
        document.querySelectorAll('.report-tab').forEach(tab => {
            tab.classList.remove('report-tab--active');
        });

        // タブコンテンツの表示/非表示を更新
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('tab-content--active');
        });

        if (tabName === 'paste-karte') {
            document.getElementById('pasteKarteTab')?.classList.add('report-tab--active');
            document.getElementById('pasteKarteContent')?.classList.add('tab-content--active');
            // ナビゲーションボタンを非表示
            const footer = document.getElementById('patientTabFooter');
            if (footer) footer.style.display = 'none';
        } else if (tabName === 'select-patient') {
            document.getElementById('selectPatientTab')?.classList.add('report-tab--active');
            document.getElementById('selectPatientContent')?.classList.add('tab-content--active');
            // ナビゲーションボタンを表示
            const footer = document.getElementById('patientTabFooter');
            if (footer) footer.style.display = 'flex';
            // 初回のみ患者リストを読み込み
            if (this.allPatients.length === 0) {
                this.loadPatients();
                this.loadCategories();
                this.initFilterControls();
            }
        }
    }

    /**
     * カルテから患者を検索
     */
    async searchPatientFromKarte() {
        const directKarteInput = document.getElementById('directKarteInput');
        if (!directKarteInput || directKarteInput.value.trim().length < 10) {
            this.showToast('カルテ内容を入力してください', 'error');
            return;
        }

        const karteContent = directKarteInput.value.trim();
        this.karteContentCache = karteContent; // カルテ内容を保持

        // カルテ内容から患者情報を抽出
        const extractedInfo = this.extractPatientInfoFromKarte(karteContent);

        if (!extractedInfo.patientId && !extractedInfo.patientName) {
            this.showToast('カルテから患者情報を抽出できませんでした。患者IDまたは患者名を確認してください。', 'error');
            return;
        }

        const generateButton = document.getElementById('generateFromPaste');
        if (generateButton) generateButton.disabled = true;

        try {
            // DBから患者を検索
            const patient = await this.searchPatientInDB(extractedInfo);

            if (patient) {
                this.confirmedPatient = patient;
                this.showPatientConfirmation(patient);
            }
        } catch (error) {
            console.error('患者検索エラー:', error);
            this.showError('患者が見つかりませんでした。患者IDと名前を確認してください。');
        } finally {
            if (generateButton) generateButton.disabled = false;
        }
    }

    /**
     * DBで患者を検索
     */
    async searchPatientInDB(extractedInfo) {
        const params = new URLSearchParams();
        if (extractedInfo.patientId) {
            params.append('patientId', extractedInfo.patientId);
        }
        if (extractedInfo.patientName) {
            params.append('patientName', extractedInfo.patientName);
        }

        const response = await fetch(`http://localhost:3000/api/patients/search?${params}`);
        const data = await response.json();

        if (!response.ok || !data.patient) {
            throw new Error(data.error || '患者が見つかりませんでした');
        }

        return data.patient;
    }

    /**
     * Step2: 患者確認画面を表示（2カラムレイアウト）
     */
    showPatientConfirmation(patient) {
        // 左カラム：メイン情報（ID・名前を大きく表示）
        document.getElementById('confirmPatientIdMain').textContent = patient.patientid || '-';
        document.getElementById('confirmPatientNameMain').textContent = `${patient.patientname || '-'} 様`;

        // 右カラム：詳細情報
        // 生年月日フォーマット
        if (patient.birthdate) {
            const birthdate = new Date(patient.birthdate);
            const formatted = `${birthdate.getFullYear()}年${birthdate.getMonth() + 1}月${birthdate.getDate()}日`;
            document.getElementById('confirmBirthdate').textContent = formatted;
        } else {
            document.getElementById('confirmBirthdate').textContent = '-';
        }

        document.getElementById('confirmAddress').textContent = patient.address || '未登録';

        // ケアオフィス情報
        document.getElementById('confirmOfficeName').textContent = patient.office_name || '未登録';
        document.getElementById('confirmCmName').textContent = patient.cm_name || '未登録';
        document.getElementById('confirmOfficeAddress').textContent = patient.office_address || '未登録';

        // 訪問看護ステーション情報（ある場合のみ表示）
        const vnsSection = document.getElementById('vnsSection');
        if (patient.vns_name) {
            vnsSection.style.display = 'block';
            document.getElementById('confirmVnsName').textContent = patient.vns_name;
            document.getElementById('confirmVnsAddress').textContent = patient.vns_address || '未登録';
            document.getElementById('confirmVnsTel').textContent = patient.vns_tel || '未登録';
        } else {
            vnsSection.style.display = 'none';
        }

        // 過去の書類作成履歴を表示
        const historyList = document.getElementById('documentHistory');
        if (patient.recent_reports && patient.recent_reports.length > 0) {
            historyList.innerHTML = patient.recent_reports
                .map(report => {
                    const dateStr = report.createdAt || report.createdat;
                    const fileName = report.fileName || report.filename;
                    return `
                        <li>
                            <strong>${dateStr}</strong> - ${fileName}
                        </li>
                    `;
                })
                .join('');
        } else {
            historyList.innerHTML = '<li class="no-history">過去の書類作成履歴はありません</li>';
        }

        // Step1を非表示、Step2を表示
        document.getElementById('karteStep1').style.display = 'none';
        document.getElementById('karteStep2').style.display = 'block';

        // エラーメッセージを非表示
        document.getElementById('confirmationError').style.display = 'none';
    }

    /**
     * エラー表示
     */
    showError(message) {
        const errorEl = document.getElementById('confirmationError');
        const errorMessage = errorEl.querySelector('.error-message');
        if (errorEl && errorMessage) {
            errorMessage.textContent = message;
            errorEl.style.display = 'flex';
        }
        this.showToast(message, 'error');
    }

    /**
     * Step1に戻る
     */
    backToKarteInput() {
        document.getElementById('karteStep2').style.display = 'none';
        document.getElementById('karteStep1').style.display = 'block';
        this.confirmedPatient = null;
    }

    /**
     * 患者確認後、報告書を生成
     */
    async confirmPatientAndGenerate() {
        if (!this.confirmedPatient) {
            this.showToast('患者情報が確認されていません', 'error');
            return;
        }

        // 既存の患者選択フローと同じ処理を実行
        this.selectedPatient = this.confirmedPatient;
        this.patientData = this.confirmedPatient;

        // 最初に新しいタブを開く
        const reportWindow = window.open('about:blank', '_blank');
        if (!reportWindow) {
            this.showToast('ポップアップがブロックされています。ポップアップを許可してください。', 'error');
            return;
        }

        // ローディング画面を表示
        this.showLoadingWindow(reportWindow);

        const confirmBtn = document.getElementById('confirmPatientBtn');
        if (confirmBtn) confirmBtn.disabled = true;

        try {
            // AI APIを呼び出し（カルテ内容を使用）
            const aiData = await this.callAIAPIWithPreparedData();

            if (aiData) {
                this.aiGeneratedData = aiData;
                await this.generateReport(reportWindow);
            } else {
                reportWindow.close();
                this.showToast('AI生成に失敗しました', 'error');
            }
        } catch (error) {
            console.error('報告書生成エラー:', error);
            reportWindow.close();
            this.showToast('報告書生成に失敗しました', 'error');
        } finally {
            if (confirmBtn) confirmBtn.disabled = false;
        }
    }

    /**
     * カルテ内容を使用してAI APIを呼び出す
     */
    async callAIAPIWithPreparedData() {
        try {
            const response = await fetch('http://localhost:3000/api/ai/generate-kyotaku-report', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    patient_id: this.confirmedPatient.patientid,
                    karte_content: this.karteContentCache
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'AI APIの呼び出しに失敗しました');
            }

            const result = await response.json();
            if (result.success && result.data) {
                return result.data;
            } else {
                throw new Error(result.error || 'AI生成に失敗しました');
            }
        } catch (error) {
            console.error('AI API Error:', error);
            throw error;
        }
    }

    /**
     * カルテ内容から患者情報を抽出（改良版）
     */
    extractPatientInfoFromKarte(karteContent) {
        const info = {
            patientId: '',
            patientName: '',
            birthdate: '',
            age: '',
            address: '',
            cmName: '',
            doctorName: 'たすくホームクリニック医師'
        };

        // 患者ID（8桁数字）を抽出 - より柔軟なパターン
        const idPatterns = [
            /患者ID[:：]?\s*(\d{8})/i,
            /ID[:：]?\s*(\d{8})/,
            /患者番号[:：]?\s*(\d{8})/,
            /(\d{8})\s*[\(（]?患者/
        ];

        for (const pattern of idPatterns) {
            const match = karteContent.match(pattern);
            if (match) {
                info.patientId = match[1];
                break;
            }
        }

        // 患者名を抽出
        const namePatterns = [
            /患者名[:：]?\s*([^\s\n]+(?:\s+[^\s\n]+)*)/,
            /氏名[:：]?\s*([^\s\n]+(?:\s+[^\s\n]+)*)/,
            /名前[:：]?\s*([^\s\n]+(?:\s+[^\s\n]+)*)/
        ];

        for (const pattern of namePatterns) {
            const match = karteContent.match(pattern);
            if (match) {
                info.patientName = match[1].trim();
                break;
            }
        }


        // 生年月日を抽出
        const birthMatch = karteContent.match(/生年月日[:：]\s*(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/);
        if (birthMatch) {
            info.birthdate = birthMatch[1];
            // 年齢を計算
            const birthDate = new Date(birthMatch[1].replace(/\//g, '-'));
            if (!isNaN(birthDate.getTime())) {
                info.age = this.calculateAge(birthDate);
            }
        }

        // ケアマネージャー名を抽出
        const cmMatch = karteContent.match(/ケアマネ(?:ー?ジャー)?[:：]\s*(.+)/);
        if (cmMatch) info.cmName = cmMatch[1].trim();

        return info;
    }


    /**
     * ローディング画面を表示
     */
    showLoadingWindow(reportWindow) {
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

        // 患者選択モーダル関連イベント
        this.setupModalEventListeners();
    }

    /**
     * モーダル関連のイベントリスナー設定
     */
    setupModalEventListeners() {
        // 「別の患者を選択する」ボタン
        const changePatientBtn = document.getElementById('changePatientBtn');
        if (changePatientBtn) {
            changePatientBtn.addEventListener('click', () => this.openPatientModal());
        }

        // モーダル閉じるボタン
        const modalCloseBtn = document.getElementById('modalCloseBtn');
        if (modalCloseBtn) {
            modalCloseBtn.addEventListener('click', () => this.closePatientModal());
        }

        // モーダルキャンセルボタン
        const modalCancelBtn = document.getElementById('modalCancelBtn');
        if (modalCancelBtn) {
            modalCancelBtn.addEventListener('click', () => this.closePatientModal());
        }

        // モーダル確認ボタン
        const modalConfirmBtn = document.getElementById('modalConfirmBtn');
        if (modalConfirmBtn) {
            modalConfirmBtn.addEventListener('click', () => this.confirmPatientSelection());
        }

        // 背景クリックで閉じる
        const modalBackdrop = document.getElementById('patientModalBackdrop');
        if (modalBackdrop) {
            modalBackdrop.addEventListener('click', (e) => {
                if (e.target === modalBackdrop) {
                    this.closePatientModal();
                }
            });
        }

        // 患者プルダウンの選択変更
        const patientDropdown = document.getElementById('patientDropdown');
        if (patientDropdown) {
            patientDropdown.addEventListener('change', () => this.onPatientDropdownChange());
        }

        // モーダル内検索
        const modalSearchInput = document.getElementById('modalSearchInput');
        if (modalSearchInput) {
            modalSearchInput.addEventListener('input', (e) => this.filterModalPatients(e.target.value));
        }

        // ESCキーでモーダルを閉じる
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const modalBackdrop = document.getElementById('patientModalBackdrop');
                if (modalBackdrop && modalBackdrop.style.display !== 'none') {
                    this.closePatientModal();
                }
            }
        });
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

            // フィルター設定を使用してAPIを呼び出し
            const params = new URLSearchParams();
            if (this.filterSettings.sort) params.append('sort', this.filterSettings.sort);
            if (this.filterSettings.filter) params.append('filter', this.filterSettings.filter);
            if (this.filterSettings.category) params.append('category', this.filterSettings.category);

            const response = await fetch(`http://localhost:3000/api/patients/ai-report-status?${params}`);
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

        patientGrid.innerHTML = patients.map(patient => {
            // AI報告書情報の構築
            const hasReports = patient.last_ai_generated_at && patient.last_report_title;
            const aiInfo = hasReports
                ? `<div class="patient-ai-info">
                     <span class="ai-date">
                       <span class="ai-date-icon">📅</span>
                       最終: ${patient.last_ai_generated_at}
                     </span>
                     <span class="ai-title">
                       <span class="ai-title-icon">📄</span>
                       ${patient.last_report_title}
                     </span>
                   </div>`
                : `<div class="patient-ai-info">
                     <span class="no-ai-report">AI報告書未作成</span>
                   </div>`;

            // 過去の報告書リストの構築
            const recentReports = patient.recent_reports && patient.recent_reports.length > 0
                ? patient.recent_reports.map(report => `
                    <li class="report-history-item">
                        <span class="report-date">${report.createdAt}</span>
                        <span class="report-title">${report.fileName}</span>
                    </li>
                  `).join('')
                : '<li class="no-reports">過去の報告書はありません</li>';

            return `
                <div class="patient-card" data-patient-id="${patient.patientid}">
                    <div class="patient-card-header">
                        <div class="patient-card-main">
                            <span class="patient-id">ID: ${patient.patientid}</span>
                            <span class="patient-name">${patient.patientname || '未設定'}</span>
                            ${patient.has_ai_this_month ? '<span class="ai-report-badge">今月作成済</span>' : ''}
                            ${hasReports
                                ? `<span class="ai-date"><span class="ai-date-icon">📅</span>最終: ${patient.last_ai_generated_at}</span><span class="ai-title"><span class="ai-title-icon">📄</span>${patient.last_report_title}</span>`
                                : '<span class="no-ai-report">AI報告書未作成</span>'
                            }
                        </div>
                        ${hasReports ? '<button class="toggle-button" aria-label="詳細を表示"><span class="toggle-icon">▼</span></button>' : ''}
                    </div>
                    ${hasReports ? `
                        <div class="patient-card-detail" style="display: none;">
                            <div class="detail-content">
                                <h4 class="detail-title">📋 過去の報告書</h4>
                                <ul class="report-history">
                                    ${recentReports}
                                </ul>
                            </div>
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');

        // 患者カードのイベント設定
        document.querySelectorAll('.patient-card').forEach(card => {
            const toggleButton = card.querySelector('.toggle-button');
            const detail = card.querySelector('.patient-card-detail');

            // トグルボタンのクリックイベント（展開/折りたたみ専用）
            if (toggleButton) {
                toggleButton.addEventListener('click', (e) => {
                    e.stopPropagation(); // イベントバブリングを防ぐ
                    this.togglePatientDetail(card);
                });
            }

            // 患者カード全体のシングルクリックで選択（トグルボタンを除く）
            card.addEventListener('click', (e) => {
                // トグルボタンをクリックした場合は何もしない
                if (e.target.closest('.toggle-button')) {
                    return;
                }
                this.handlePatientSelection(card);
            });
        });
    }

    /**
     * 患者カードのトグル機能
     */
    togglePatientDetail(card) {
        const detail = card.querySelector('.patient-card-detail');
        const toggleIcon = card.querySelector('.toggle-icon');

        if (detail) {
            if (detail.style.display === 'none') {
                // 展開
                detail.style.display = 'block';
                card.classList.add('expanded');
                if (toggleIcon) toggleIcon.textContent = '▲';
            } else {
                // 折りたたみ
                detail.style.display = 'none';
                card.classList.remove('expanded');
                if (toggleIcon) toggleIcon.textContent = '▼';
            }
        }
    }

    /**
     * 患者選択処理
     */
    handlePatientSelection(card) {
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

    /**
     * カテゴリー一覧を読み込み
     */
    async loadCategories() {
        try {
            const response = await fetch('http://localhost:3000/api/patients/ai-report-categories');
            if (!response.ok) return;

            const data = await response.json();
            if (data.success && data.categories) {
                const categoryFilter = document.getElementById('categoryFilter');
                if (categoryFilter) {
                    // 既存のオプションをクリア（最初の「全て」は残す）
                    categoryFilter.innerHTML = '<option value="">全てのカテゴリー</option>';

                    // カテゴリーを追加
                    data.categories.forEach(category => {
                        const option = document.createElement('option');
                        option.value = category;
                        option.textContent = category;
                        categoryFilter.appendChild(option);
                    });
                }
            }
        } catch (error) {
            console.error('カテゴリー読み込みエラー:', error);
        }
    }

    /**
     * フィルターコントロールの初期化
     */
    initFilterControls() {
        // ソート順変更
        const sortOrder = document.getElementById('sortOrder');
        if (sortOrder) {
            sortOrder.addEventListener('change', (e) => {
                this.filterSettings.sort = e.target.value;
                this.loadPatients();
            });
        }

        // カテゴリーフィルター
        const categoryFilter = document.getElementById('categoryFilter');
        if (categoryFilter) {
            categoryFilter.addEventListener('change', (e) => {
                this.filterSettings.category = e.target.value;
                this.loadPatients();
            });
        }

        // 今月未作成フィルター
        const filterNoAI = document.getElementById('filterNoAI');
        if (filterNoAI) {
            filterNoAI.addEventListener('change', (e) => {
                this.filterSettings.filter = e.target.checked ? 'no-ai-this-month' : '';
                this.loadPatients();
            });
        }
    }

    /**
     * 患者選択モーダルを開く
     */
    async openPatientModal() {
        const modalBackdrop = document.getElementById('patientModalBackdrop');
        if (!modalBackdrop) return;

        // モーダル表示
        modalBackdrop.style.display = 'flex';

        // アニメーション用のshowクラスを少し遅らせて追加
        setTimeout(() => {
            modalBackdrop.classList.add('show');
        }, 10);

        // 患者データがなければ読み込み
        if (this.allPatients.length === 0) {
            await this.loadAllPatientsForModal();
        } else {
            this.populatePatientDropdown(this.allPatients);
        }

        // フォーカス設定（アクセシビリティ）
        const searchInput = document.getElementById('modalSearchInput');
        if (searchInput) {
            searchInput.focus();
        }
    }

    /**
     * 患者選択モーダルを閉じる
     */
    closePatientModal() {
        const modalBackdrop = document.getElementById('patientModalBackdrop');
        if (!modalBackdrop) return;

        // アニメーション
        modalBackdrop.classList.remove('show');

        setTimeout(() => {
            modalBackdrop.style.display = 'none';
            this.resetModalState();
        }, 300);
    }

    /**
     * モーダルの状態をリセット
     */
    resetModalState() {
        const searchInput = document.getElementById('modalSearchInput');
        const dropdown = document.getElementById('patientDropdown');
        const confirmBtn = document.getElementById('modalConfirmBtn');

        if (searchInput) searchInput.value = '';
        if (dropdown) dropdown.selectedIndex = 0;
        if (confirmBtn) confirmBtn.disabled = true;
    }

    /**
     * モーダル用に全患者データを読み込み
     */
    async loadAllPatientsForModal() {
        const dropdown = document.getElementById('patientDropdown');
        if (!dropdown) return;

        try {
            dropdown.innerHTML = '<option value="">患者データを読み込み中...</option>';

            const response = await fetch('http://localhost:3000/api/patients/all');
            if (!response.ok) throw new Error('患者データの取得に失敗しました');

            const data = await response.json();
            this.modalPatients = data.patients || [];
            this.populatePatientDropdown(this.modalPatients);

        } catch (error) {
            console.error('患者データ読み込みエラー:', error);
            dropdown.innerHTML = '<option value="">データの読み込みに失敗しました</option>';
            this.showToast('患者データの読み込みに失敗しました', 'error');
        }
    }

    /**
     * プルダウンに患者リストを設定
     */
    populatePatientDropdown(patients) {
        const dropdown = document.getElementById('patientDropdown');
        if (!dropdown) return;

        // デフォルトオプション
        dropdown.innerHTML = '<option value="">患者を選択してください...</option>';

        // 患者オプションを追加
        patients.forEach(patient => {
            const option = document.createElement('option');
            option.value = patient.patientid;
            option.textContent = `${patient.patientid} -- ${patient.patientname}`;
            dropdown.appendChild(option);
        });
    }

    /**
     * プルダウン選択変更時の処理
     */
    onPatientDropdownChange() {
        const dropdown = document.getElementById('patientDropdown');
        const confirmBtn = document.getElementById('modalConfirmBtn');

        if (dropdown && confirmBtn) {
            confirmBtn.disabled = !dropdown.value;
        }
    }

    /**
     * モーダル内患者検索・フィルタリング
     */
    filterModalPatients(searchTerm) {
        if (!this.modalPatients) return;

        const filteredPatients = this.modalPatients.filter(patient => {
            const searchLower = searchTerm.toLowerCase();
            return patient.patientname.toLowerCase().includes(searchLower) ||
                   patient.patientid.includes(searchTerm);
        });

        this.populatePatientDropdown(filteredPatients);
    }

    /**
     * 患者選択を確認・適用
     */
    async confirmPatientSelection() {
        const dropdown = document.getElementById('patientDropdown');
        if (!dropdown || !dropdown.value) return;

        const selectedPatientId = dropdown.value;

        try {
            // 選択された患者の詳細情報を取得
            const response = await fetch(`http://localhost:3000/api/patients/${selectedPatientId}`);
            if (!response.ok) throw new Error('患者情報の取得に失敗しました');

            const data = await response.json();
            const patient = data.patient;

            // 状態を更新
            this.confirmedPatient = patient;
            this.selectedPatient = patient;
            this.patientData = patient;

            // 患者確認画面を更新
            this.showPatientConfirmation(patient);

            // モーダルを閉じる
            this.closePatientModal();

            this.showToast(`患者を ${patient.patientname} 様に変更しました`, 'success');

        } catch (error) {
            console.error('患者選択エラー:', error);
            this.showToast('患者情報の取得に失敗しました', 'error');
        }
    }
}

// ページ読み込み時に初期化
document.addEventListener('DOMContentLoaded', () => {
    new AIReportPage();
});