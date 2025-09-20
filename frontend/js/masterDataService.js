/**
 * マスターデータ管理APIサービス
 * 居宅介護支援事業所、ケアマネージャー、訪問看護ステーションのCRUD操作を提供
 */

class MasterDataService {
    constructor() {
        this.baseURL = 'http://localhost:3000/api';
        // キャッシュ管理
        this.cache = {
            careOffices: null,
            careManagers: null,
            visitingNurseStations: null,
            lastFetch: {
                careOffices: 0,
                careManagers: 0,
                visitingNurseStations: 0
            }
        };
        this.cacheTimeout = 5 * 60 * 1000; // 5分
    }

    /**
     * APIリクエストのラッパー
     * @param {string} url - URL
     * @param {Object} options - fetch options
     */
    async fetchAPI(url, options = {}) {
        try {
            const response = await fetch(url, {
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                }
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({ message: response.statusText }));
                throw new APIError(response.status, error.message || 'API request failed', error);
            }

            return await response.json();
        } catch (error) {
            if (error instanceof APIError) {
                throw error;
            }
            throw new APIError(0, 'Network error', error);
        }
    }

    // ========================================
    // 居宅介護支援事業所 (Care Offices)
    // ========================================

    /**
     * 居宅介護支援事業所一覧を取得
     * @param {boolean} forceRefresh - キャッシュを無視して再取得
     */
    async getCareOffices(forceRefresh = false) {
        const now = Date.now();
        if (!forceRefresh &&
            this.cache.careOffices &&
            (now - this.cache.lastFetch.careOffices) < this.cacheTimeout) {
            return this.cache.careOffices;
        }

        const data = await this.fetchAPI(`${this.baseURL}/care-offices`);
        const offices = data.offices || data; // API レスポンス形式に対応
        this.cache.careOffices = offices;
        this.cache.lastFetch.careOffices = now;
        return offices;
    }

    /**
     * 居宅介護支援事業所を新規登録
     * @param {Object} officeData - { name: string, address: string }
     */
    async createCareOffice(officeData) {
        const newOffice = await this.fetchAPI(`${this.baseURL}/care-offices`, {
            method: 'POST',
            body: JSON.stringify(officeData)
        });

        // キャッシュに追加
        if (this.cache.careOffices) {
            this.cache.careOffices.push(newOffice);
        }

        return newOffice;
    }

    /**
     * 居宅介護支援事業所を更新
     * @param {number} officeId - 事業所ID
     * @param {Object} officeData - 更新データ
     */
    async updateCareOffice(officeId, officeData) {
        const updatedOffice = await this.fetchAPI(`${this.baseURL}/care-offices/${officeId}`, {
            method: 'PUT',
            body: JSON.stringify(officeData)
        });

        // キャッシュを更新
        if (this.cache.careOffices) {
            const index = this.cache.careOffices.findIndex(o => o.office_id === officeId);
            if (index !== -1) {
                this.cache.careOffices[index] = updatedOffice;
            }
        }

        return updatedOffice;
    }

    /**
     * 居宅介護支援事業所を削除
     * @param {number} officeId - 事業所ID
     */
    async deleteCareOffice(officeId) {
        await this.fetchAPI(`${this.baseURL}/care-offices/${officeId}`, {
            method: 'DELETE'
        });

        // キャッシュから削除
        if (this.cache.careOffices) {
            this.cache.careOffices = this.cache.careOffices.filter(o => o.office_id !== officeId);
        }
    }

    // ========================================
    // ケアマネージャー (Care Managers)
    // ========================================

    /**
     * ケアマネージャー一覧を取得
     * @param {boolean} forceRefresh - キャッシュを無視して再取得
     */
    async getCareManagers(forceRefresh = false) {
        const now = Date.now();
        if (!forceRefresh &&
            this.cache.careManagers &&
            (now - this.cache.lastFetch.careManagers) < this.cacheTimeout) {
            return this.cache.careManagers;
        }

        const data = await this.fetchAPI(`${this.baseURL}/care-managers`);
        const managers = data.managers || data; // API レスポンス形式に対応
        this.cache.careManagers = managers;
        this.cache.lastFetch.careManagers = now;
        return managers;
    }

    /**
     * 特定の事業所に所属するケアマネージャーを取得
     * @param {number} officeId - 事業所ID
     */
    async getCareManagersByOffice(officeId) {
        return await this.fetchAPI(`${this.baseURL}/care-managers/office/${officeId}`);
    }

    /**
     * ケアマネージャーを新規登録
     * @param {Object} managerData - { name: string, office_id: number }
     */
    async createCareManager(managerData) {
        const newManager = await this.fetchAPI(`${this.baseURL}/care-managers`, {
            method: 'POST',
            body: JSON.stringify(managerData)
        });

        // キャッシュに追加
        if (this.cache.careManagers) {
            this.cache.careManagers.push(newManager);
        }

        return newManager;
    }

    /**
     * ケアマネージャーを更新
     * @param {number} managerId - ケアマネージャーID
     * @param {Object} managerData - 更新データ
     */
    async updateCareManager(managerId, managerData) {
        const updatedManager = await this.fetchAPI(`${this.baseURL}/care-managers/${managerId}`, {
            method: 'PUT',
            body: JSON.stringify(managerData)
        });

        // キャッシュを更新
        if (this.cache.careManagers) {
            const index = this.cache.careManagers.findIndex(m => m.cm_id === managerId);
            if (index !== -1) {
                this.cache.careManagers[index] = updatedManager;
            }
        }

        return updatedManager;
    }

    /**
     * ケアマネージャーを削除
     * @param {number} managerId - ケアマネージャーID
     */
    async deleteCareManager(managerId) {
        await this.fetchAPI(`${this.baseURL}/care-managers/${managerId}`, {
            method: 'DELETE'
        });

        // キャッシュから削除
        if (this.cache.careManagers) {
            this.cache.careManagers = this.cache.careManagers.filter(m => m.cm_id !== managerId);
        }
    }

    // ========================================
    // 訪問看護ステーション (Visiting Nurse Stations)
    // ========================================

    /**
     * 訪問看護ステーション一覧を取得
     * @param {boolean} forceRefresh - キャッシュを無視して再取得
     */
    async getVisitingNurseStations(forceRefresh = false) {
        const now = Date.now();
        if (!forceRefresh &&
            this.cache.visitingNurseStations &&
            (now - this.cache.lastFetch.visitingNurseStations) < this.cacheTimeout) {
            return this.cache.visitingNurseStations;
        }

        const data = await this.fetchAPI(`${this.baseURL}/vns`);
        const stations = data.stations || data; // API レスポンス形式に対応
        this.cache.visitingNurseStations = stations;
        this.cache.lastFetch.visitingNurseStations = now;
        return stations;
    }

    /**
     * 訪問看護ステーションを新規登録
     * @param {Object} stationData - { name: string, address?: string, tel?: string }
     */
    async createVisitingNurseStation(stationData) {
        const newStation = await this.fetchAPI(`${this.baseURL}/vns`, {
            method: 'POST',
            body: JSON.stringify(stationData)
        });

        // キャッシュに追加
        if (this.cache.visitingNurseStations) {
            this.cache.visitingNurseStations.push(newStation);
        }

        return newStation;
    }

    /**
     * 訪問看護ステーションを更新
     * @param {number} stationId - ステーションID
     * @param {Object} stationData - 更新データ
     */
    async updateVisitingNurseStation(stationId, stationData) {
        const updatedStation = await this.fetchAPI(`${this.baseURL}/vns/${stationId}`, {
            method: 'PUT',
            body: JSON.stringify(stationData)
        });

        // キャッシュを更新
        if (this.cache.visitingNurseStations) {
            const index = this.cache.visitingNurseStations.findIndex(s => s.vns_id === stationId);
            if (index !== -1) {
                this.cache.visitingNurseStations[index] = updatedStation;
            }
        }

        return updatedStation;
    }

    /**
     * 訪問看護ステーションを削除
     * @param {number} stationId - ステーションID
     */
    async deleteVisitingNurseStation(stationId) {
        await this.fetchAPI(`${this.baseURL}/vns/${stationId}`, {
            method: 'DELETE'
        });

        // キャッシュから削除
        if (this.cache.visitingNurseStations) {
            this.cache.visitingNurseStations = this.cache.visitingNurseStations.filter(
                s => s.vns_id !== stationId
            );
        }
    }

    // ========================================
    // ユーティリティメソッド
    // ========================================

    /**
     * セレクトボックスにオプションを設定
     * @param {string|HTMLElement} selectElement - セレクト要素またはそのID
     * @param {Array} items - オプション項目の配列
     * @param {Object} options - { valueField, textField, placeholder, selectedValue }
     */
    populateSelect(selectElement, items, options = {}) {
        const {
            valueField = 'id',
            textField = 'name',
            placeholder = '選択してください',
            selectedValue = null
        } = options;

        const select = typeof selectElement === 'string'
            ? document.getElementById(selectElement)
            : selectElement;

        if (!select) return;

        // クリアして再構築
        select.innerHTML = '';

        // プレースホルダーオプション
        if (placeholder) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = placeholder;
            select.appendChild(option);
        }

        // アイテムを追加
        items.forEach(item => {
            const option = document.createElement('option');
            option.value = item[valueField];
            option.textContent = item[textField];
            if (selectedValue && item[valueField] == selectedValue) {
                option.selected = true;
            }
            select.appendChild(option);
        });
    }

    /**
     * 統計情報を取得
     */
    async getStatistics() {
        try {
            const [offices, managers, stations] = await Promise.all([
                this.getCareOffices(),
                this.getCareManagers(),
                this.getVisitingNurseStations()
            ]);

            return {
                careOfficesCount: offices.length,
                careManagersCount: managers.length,
                visitingNurseStationsCount: stations.length
            };
        } catch (error) {
            console.error('Failed to get statistics:', error);
            return {
                careOfficesCount: 0,
                careManagersCount: 0,
                visitingNurseStationsCount: 0
            };
        }
    }

    /**
     * キャッシュをクリア
     */
    clearCache() {
        this.cache.careOffices = null;
        this.cache.careManagers = null;
        this.cache.visitingNurseStations = null;
        this.cache.lastFetch.careOffices = 0;
        this.cache.lastFetch.careManagers = 0;
        this.cache.lastFetch.visitingNurseStations = 0;
    }
}

/**
 * カスタムエラークラス
 */
class APIError extends Error {
    constructor(status, message, details = null) {
        super(message);
        this.name = 'APIError';
        this.status = status;
        this.details = details;
    }

    /**
     * エラーメッセージを日本語で取得
     */
    getLocalizedMessage() {
        if (this.status === 0) {
            return 'ネットワークエラーが発生しました。接続を確認してください。';
        } else if (this.status === 400) {
            return '入力内容に誤りがあります。';
        } else if (this.status === 401) {
            return '認証が必要です。';
        } else if (this.status === 403) {
            return 'アクセスが拒否されました。';
        } else if (this.status === 404) {
            return 'データが見つかりません。';
        } else if (this.status === 409) {
            return 'データが既に存在します。';
        } else if (this.status === 422) {
            return 'バリデーションエラー: ' + this.getValidationErrors();
        } else if (this.status >= 500) {
            return 'サーバーエラーが発生しました。しばらく待ってから再度お試しください。';
        }
        return this.message;
    }

    /**
     * バリデーションエラーの詳細を取得
     */
    getValidationErrors() {
        if (this.details && this.details.errors) {
            return Object.entries(this.details.errors)
                .map(([field, errors]) => `${field}: ${errors.join(', ')}`)
                .join('\n');
        }
        return '';
    }
}

// シングルトンインスタンスをエクスポート
window.masterDataService = new MasterDataService();