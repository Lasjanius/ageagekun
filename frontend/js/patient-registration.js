/**
 * 患者新規登録画面 JavaScript
 */

// API基底URL
const API_BASE = 'http://localhost:3000/api';

// DOM要素のキャッシュ
const elements = {
    form: document.getElementById('patientRegistrationForm'),
    patientID: document.getElementById('patientID'),
    patientName: document.getElementById('patientName'),
    birthdate: document.getElementById('birthdate'),
    birthYear: document.getElementById('birthYear'),
    birthMonth: document.getElementById('birthMonth'),
    birthDay: document.getElementById('birthDay'),
    address: document.getElementById('address'),

    // セレクトボックス
    cmSelect: document.getElementById('cmSelect'),
    officeSelect: document.getElementById('officeSelect'),
    vnsSelect: document.getElementById('vnsSelect'),

    // Hidden fields for legacy columns
    cmname: document.getElementById('cmname'),
    homecareoffice: document.getElementById('homecareoffice'),
    visitingnurse: document.getElementById('visitingnurse'),

    // モーダル
    cmModal: document.getElementById('cmModal'),
    officeModal: document.getElementById('officeModal'),
    vnsModal: document.getElementById('vnsModal'),
    confirmModal: document.getElementById('confirmModal'),

    // トースト
    toastContainer: document.getElementById('toastContainer')
};

// マスターデータを読み込み
async function loadMasterData() {
    try {
        const [officeRes, vnsRes] = await Promise.all([
            fetch(`${API_BASE}/care-offices`),
            fetch(`${API_BASE}/vns`)
        ]);

        const [officeData, vnsData] = await Promise.all([
            officeRes.json(),
            vnsRes.json()
        ]);

        // ケアマネージャーセレクトは初期状態で無効化（居宅選択後に有効化）
        if (elements.cmSelect) {
            elements.cmSelect.innerHTML = '<option value="">まず居宅介護支援事業所を選択してください</option>';
            elements.cmSelect.disabled = true;
        }

        // 居宅介護支援事業所（レガシー用）
        if (officeData.success && elements.officeSelect) {
            elements.officeSelect.innerHTML = '<option value="">選択してください</option>';
            officeData.offices.forEach(office => {
                const option = document.createElement('option');
                option.value = office.office_id;
                option.textContent = office.name;
                option.dataset.name = office.name;
                elements.officeSelect.appendChild(option);
            });

            // ケアマネージャーモーダル内のセレクトも更新
            const cmOfficeSelect = document.getElementById('cmOffice');
            if (cmOfficeSelect) {
                cmOfficeSelect.innerHTML = '<option value="">選択してください</option>';
                officeData.offices.forEach(office => {
                    const option = document.createElement('option');
                    option.value = office.office_id;
                    option.textContent = office.name;
                    cmOfficeSelect.appendChild(option);
                });
            }
        }

        // 訪問看護ステーション
        if (vnsData.success && elements.vnsSelect) {
            elements.vnsSelect.innerHTML = '<option value="">選択してください</option>';
            vnsData.stations.forEach(station => {
                const option = document.createElement('option');
                option.value = station.vns_id;
                option.textContent = station.name;
                option.dataset.name = station.name;
                elements.vnsSelect.appendChild(option);
            });
        }
    } catch (error) {
        console.error('マスターデータの取得に失敗しました:', error);
        showToast('データの読み込みに失敗しました', 'error');
    }
}

// セレクトボックスの変更を監視してレガシー列を更新
function setupSelectListeners() {
    // 事業所選択時
    if (elements.officeSelect) {
        elements.officeSelect.addEventListener('change', async (e) => {
            const selectedOption = e.target.options[e.target.selectedIndex];
            const officeId = e.target.value;

            // レガシー列の更新
            if (selectedOption && selectedOption.dataset.name) {
                elements.homecareoffice.value = selectedOption.dataset.name;
            } else {
                elements.homecareoffice.value = '';
            }

            // 事業所が選択された場合、その事業所のケアマネージャーを取得
            if (officeId) {
                try {
                    const response = await fetch(`${API_BASE}/care-managers/office/${officeId}`);
                    const data = await response.json();

                    if (data.success && elements.cmSelect) {
                        elements.cmSelect.disabled = false;
                        elements.cmSelect.innerHTML = '<option value="">選択してください</option>';

                        if (data.managers && data.managers.length > 0) {
                            data.managers.forEach(manager => {
                                const option = document.createElement('option');
                                option.value = manager.cm_id;
                                option.textContent = manager.name;
                                option.dataset.name = manager.name;
                                elements.cmSelect.appendChild(option);
                            });
                        } else {
                            elements.cmSelect.innerHTML = '<option value="">この事業所にケアマネージャーがいません</option>';
                        }
                    }
                } catch (error) {
                    console.error('ケアマネージャー取得エラー:', error);
                    showToast('ケアマネージャーの取得に失敗しました', 'error');
                }
            } else {
                // 事業所が未選択の場合、ケアマネージャーを無効化
                elements.cmSelect.disabled = true;
                elements.cmSelect.innerHTML = '<option value="">まず居宅介護支援事業所を選択してください</option>';
                elements.cmname.value = '';
            }
        });
    }

    // ケアマネージャー選択時
    if (elements.cmSelect) {
        // フォーカス時のチェック
        elements.cmSelect.addEventListener('focus', (e) => {
            if (!elements.officeSelect.value) {
                e.target.blur();
                showToast('まず居宅介護支援事業所を選択してください', 'warning');
                elements.officeSelect.focus();
            }
        });

        // 選択変更時
        elements.cmSelect.addEventListener('change', (e) => {
            const selectedOption = e.target.options[e.target.selectedIndex];
            if (selectedOption && selectedOption.dataset.name) {
                elements.cmname.value = selectedOption.dataset.name;
            } else {
                elements.cmname.value = '';
            }
        });
    }

    // 訪問看護ステーション選択時
    if (elements.vnsSelect) {
        elements.vnsSelect.addEventListener('change', (e) => {
            const selectedOption = e.target.options[e.target.selectedIndex];
            if (selectedOption && selectedOption.dataset.name) {
                elements.visitingnurse.value = selectedOption.dataset.name;
            } else {
                elements.visitingnurse.value = '';
            }
        });
    }
}

// 患者ID重複チェック（デバウンス付き）
let checkPatientIdTimeout;
function setupPatientIdCheck() {
    if (!elements.patientID) return;

    elements.patientID.addEventListener('input', (e) => {
        clearTimeout(checkPatientIdTimeout);
        const patientID = e.target.value.trim();

        if (patientID.length >= 1) {
            checkPatientIdTimeout = setTimeout(async () => {
                try {
                    const response = await fetch(`${API_BASE}/patients/${patientID}`);
                    if (response.ok) {
                        elements.patientID.classList.add('form-input--error');
                        showToast(`患者ID ${patientID} は既に使用されています`, 'warning');
                    } else if (response.status === 404) {
                        elements.patientID.classList.remove('form-input--error');
                        elements.patientID.classList.add('form-input--success');
                    }
                } catch (error) {
                    console.error('ID確認エラー:', error);
                }
            }, 500);
        } else {
            elements.patientID.classList.remove('form-input--error', 'form-input--success');
        }
    });
}

// フォーム送信処理
function setupFormSubmission() {
    if (!elements.form) return;

    elements.form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // フォームデータを収集
        const formData = {
            patientID: elements.patientID.value.trim(),
            patientName: elements.patientName.value.trim(),
            birthdate: elements.birthdate.value || null,
            address: elements.address.value.trim() || null,
            cm_id: elements.cmSelect.value || null,
            vns_id: elements.vnsSelect.value || null,
            // レガシー列
            cmname: elements.cmname.value || null,
            homecareoffice: elements.homecareoffice.value || null,
            visitingnurse: elements.visitingnurse.value || null
        };

        // 確認モーダルを表示
        showConfirmModal(formData);
    });
}

// 確認モーダル表示
function showConfirmModal(formData) {
    const modal = elements.confirmModal;
    if (!modal) return;

    const details = document.getElementById('confirmDetails');
    if (details) {
        // 生年月日を整形（YYYY-MM-DD形式の場合）
        let birthdateDisplay = '未設定';
        if (formData.birthdate) {
            const parts = formData.birthdate.split('-');
            if (parts.length === 3) {
                const year = parseInt(parts[0]);
                const month = parseInt(parts[1]);
                const day = parseInt(parts[2]);
                const eraText = getJapaneseEra(year, month, day);
                birthdateDisplay = `${year}年${month}月${day}日（${eraText}）`;
            }
        }

        details.innerHTML = `
            <dl>
                <dt>患者ID:</dt><dd>${formData.patientID}</dd>
                <dt>患者名:</dt><dd>${formData.patientName}</dd>
                <dt>生年月日:</dt><dd>${birthdateDisplay}</dd>
                <dt>住所:</dt><dd>${formData.address || '未設定'}</dd>
                <dt>ケアマネージャー:</dt><dd>${formData.cmname || '未設定'}</dd>
                <dt>居宅介護支援事業所:</dt><dd>${formData.homecareoffice || '未設定'}</dd>
                <dt>訪問看護ステーション:</dt><dd>${formData.visitingnurse || '未設定'}</dd>
            </dl>
        `;
    }

    modal.style.display = 'block';

    // 確認ボタン
    const confirmYes = document.getElementById('confirmYesBtn');
    const confirmNo = document.getElementById('confirmNoBtn');

    const closeModal = () => {
        modal.style.display = 'none';
    };

    // イベントリスナーを一度削除してから追加
    confirmYes.replaceWith(confirmYes.cloneNode(true));
    confirmNo.replaceWith(confirmNo.cloneNode(true));

    const newConfirmYes = document.getElementById('confirmYesBtn');
    const newConfirmNo = document.getElementById('confirmNoBtn');

    newConfirmYes.addEventListener('click', async () => {
        closeModal();
        await submitRegistration(formData);
    });

    newConfirmNo.addEventListener('click', closeModal);
}

// 登録実行
async function submitRegistration(formData) {
    try {
        const response = await fetch(`${API_BASE}/patients`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });

        const data = await response.json();

        if (response.ok) {
            showToast(`患者（ID: ${formData.patientID}）を登録しました`, 'success');
            // 2秒後に管理画面に戻る
            setTimeout(() => {
                window.location.href = 'admin.html';
            }, 2000);
        } else {
            showToast(data.error || '登録に失敗しました', 'error');
        }
    } catch (error) {
        console.error('登録エラー:', error);
        showToast('登録処理中にエラーが発生しました', 'error');
    }
}

// 新規登録ボタンの設定
function setupNewRegistrationButtons() {
    // ケアマネージャー新規登録
    const newCmBtn = document.getElementById('newCmBtn');
    if (newCmBtn) {
        newCmBtn.addEventListener('click', () => {
            elements.cmModal.style.display = 'block';
            loadOfficesForCM();
        });
    }

    // 居宅新規登録
    const newOfficeBtn = document.getElementById('newOfficeBtn');
    if (newOfficeBtn) {
        newOfficeBtn.addEventListener('click', () => {
            elements.officeModal.style.display = 'block';
        });
    }

    // 訪看新規登録
    const newVnsBtn = document.getElementById('newVnsBtn');
    if (newVnsBtn) {
        newVnsBtn.addEventListener('click', () => {
            elements.vnsModal.style.display = 'block';
        });
    }

    // 各モーダルの設定
    setupCMModal();
    setupOfficeModal();
    setupVNSModal();
}

// ケアマネージャーモーダル用に事業所一覧を取得
async function loadOfficesForCM() {
    try {
        const response = await fetch(`${API_BASE}/care-offices`);
        const data = await response.json();

        const cmOfficeSelect = document.getElementById('cmOffice');
        if (data.success && cmOfficeSelect) {
            cmOfficeSelect.innerHTML = '<option value="">選択してください</option>';
            data.offices.forEach(office => {
                const option = document.createElement('option');
                option.value = office.office_id;
                option.textContent = office.name;
                cmOfficeSelect.appendChild(option);
            });
        }
    } catch (error) {
        console.error('事業所一覧の取得に失敗:', error);
    }
}

// モーダル設定（重複コードをまとめる）
function setupModal(modalId, config) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    const closeBtn = modal.querySelector('.modal__close');
    const cancelBtn = modal.querySelector('[id*="cancel"]');
    const saveBtn = modal.querySelector('[id*="save"]');

    const closeModal = () => {
        modal.style.display = 'none';
        if (config.onClose) config.onClose();
    };

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

    if (saveBtn && config.onSave) {
        saveBtn.addEventListener('click', async () => {
            const result = await config.onSave();
            if (result) {
                closeModal();
                loadMasterData(); // データを再読み込み

                // 事業所が選択されている場合は、その事業所のケアマネージャーも再読み込み
                if (elements.officeSelect.value) {
                    const changeEvent = new Event('change');
                    elements.officeSelect.dispatchEvent(changeEvent);
                }
            }
        });
    }
}

// ケアマネージャー登録モーダル
function setupCMModal() {
    setupModal('cmModal', {
        onSave: async () => {
            const name = document.getElementById('cmName').value.trim();
            const office_id = document.getElementById('cmOffice').value;

            if (!name) {
                showToast('ケアマネージャー名を入力してください', 'error');
                return false;
            }

            try {
                const response = await fetch(`${API_BASE}/care-managers`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, office_id: office_id || null })
                });

                const data = await response.json();
                if (response.ok) {
                    showToast('ケアマネージャーを登録しました', 'success');
                    return true;
                } else {
                    showToast(data.error || '登録に失敗しました', 'error');
                    return false;
                }
            } catch (error) {
                showToast('登録処理中にエラーが発生しました', 'error');
                return false;
            }
        }
    });
}

// 居宅介護支援事業所登録モーダル
function setupOfficeModal() {
    setupModal('officeModal', {
        onSave: async () => {
            const name = document.getElementById('officeName').value.trim();
            const address = document.getElementById('officeAddress').value.trim();

            if (!name) {
                showToast('事業所名を入力してください', 'error');
                return false;
            }

            try {
                const response = await fetch(`${API_BASE}/care-offices`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, address })
                });

                const data = await response.json();
                if (response.ok) {
                    showToast('居宅介護支援事業所を登録しました', 'success');
                    return true;
                } else {
                    showToast(data.error || '登録に失敗しました', 'error');
                    return false;
                }
            } catch (error) {
                showToast('登録処理中にエラーが発生しました', 'error');
                return false;
            }
        }
    });
}

// 訪問看護ステーション登録モーダル
function setupVNSModal() {
    setupModal('vnsModal', {
        onSave: async () => {
            const name = document.getElementById('vnsName').value.trim();
            const address = document.getElementById('vnsAddress').value.trim();
            const tel = document.getElementById('vnsTel').value.trim();

            if (!name) {
                showToast('ステーション名を入力してください', 'error');
                return false;
            }

            try {
                const response = await fetch(`${API_BASE}/vns`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, address, tel })
                });

                const data = await response.json();
                if (response.ok) {
                    showToast('訪問看護ステーションを登録しました', 'success');
                    return true;
                } else {
                    showToast(data.error || '登録に失敗しました', 'error');
                    return false;
                }
            } catch (error) {
                showToast('登録処理中にエラーが発生しました', 'error');
                return false;
            }
        }
    });
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

// 和暦変換用の定数
const ERAS = [
    { name: '令和', start: new Date(2019, 4, 1), offset: 2018 },
    { name: '平成', start: new Date(1989, 0, 8), offset: 1988 },
    { name: '昭和', start: new Date(1926, 11, 25), offset: 1925 },
    { name: '大正', start: new Date(1912, 6, 30), offset: 1911 }
];

// 西暦から和暦を取得
function getJapaneseEra(year, month = 1, day = 1) {
    const date = new Date(year, month - 1, day);

    for (const era of ERAS) {
        if (date >= era.start) {
            const eraYear = year - era.offset;
            return `${era.name}${eraYear === 1 ? '元' : eraYear}年`;
        }
    }
    return '';
}

// 生年月日セレクトボックスの初期化
function setupBirthdateSelects() {
    // 年のプルダウンを設定
    const currentYear = new Date().getFullYear();
    const startYear = 1912; // 大正元年

    for (let year = currentYear; year >= startYear; year--) {
        const option = document.createElement('option');
        option.value = year;
        const eraText = getJapaneseEra(year);
        option.textContent = `${year}年（${eraText}）`;
        elements.birthYear.appendChild(option);
    }

    // 月のプルダウンを設定
    for (let month = 1; month <= 12; month++) {
        const option = document.createElement('option');
        option.value = String(month).padStart(2, '0');
        option.textContent = `${month}月`;
        elements.birthMonth.appendChild(option);
    }

    // 初期状態では日は空にしておく
    updateDayOptions();

    // 年月が変更されたら日を更新
    elements.birthYear.addEventListener('change', () => {
        updateDayOptions();
        updateBirthdateField();
    });

    elements.birthMonth.addEventListener('change', () => {
        updateDayOptions();
        updateBirthdateField();
    });

    elements.birthDay.addEventListener('change', () => {
        updateBirthdateField();
    });
}

// 日のオプションを更新
function updateDayOptions() {
    const year = elements.birthYear.value;
    const month = elements.birthMonth.value;

    // 現在選択されている日を保存
    const currentDay = elements.birthDay.value;

    // 日のオプションをクリア
    elements.birthDay.innerHTML = '<option value="">日</option>';

    if (!year || !month) {
        return;
    }

    // その月の最終日を取得
    const lastDay = new Date(year, month, 0).getDate();

    for (let day = 1; day <= lastDay; day++) {
        const option = document.createElement('option');
        option.value = String(day).padStart(2, '0');
        option.textContent = `${day}日`;
        elements.birthDay.appendChild(option);
    }

    // 以前選択されていた日が有効であれば再選択
    if (currentDay && parseInt(currentDay) <= lastDay) {
        elements.birthDay.value = currentDay;
    }
}

// 生年月日フィールドを更新
function updateBirthdateField() {
    const year = elements.birthYear.value;
    const month = elements.birthMonth.value;
    const day = elements.birthDay.value;

    if (year && month && day) {
        elements.birthdate.value = `${year}-${month}-${day}`;
    } else {
        elements.birthdate.value = '';
    }
}

// 初期化
document.addEventListener('DOMContentLoaded', () => {
    console.log('患者登録画面を初期化しています...');

    // 生年月日セレクトボックスの初期化
    setupBirthdateSelects();

    // マスターデータを読み込み
    loadMasterData();

    // イベントリスナー設定
    setupSelectListeners();
    setupPatientIdCheck();
    setupFormSubmission();
    setupNewRegistrationButtons();
});