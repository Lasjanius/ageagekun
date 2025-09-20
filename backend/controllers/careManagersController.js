const db = require('../config/database');

// ケアマネージャー一覧取得
const getAllCareManagers = async (req, res) => {
  try {
    const query = `
      SELECT
        cm.cm_id,
        cm.name,
        cm.office_id,
        co.name as office_name,
        co.address as office_address,
        cm.created_at,
        cm.updated_at
      FROM care_managers cm
      LEFT JOIN care_offices co ON cm.office_id = co.office_id
      ORDER BY cm.name
    `;

    const result = await db.query(query);

    res.json({
      success: true,
      count: result.rows.length,
      managers: result.rows
    });
  } catch (error) {
    console.error('Error fetching care managers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch care managers'
    });
  }
};

// 特定の事業所のケアマネージャー取得
const getCareManagersByOffice = async (req, res) => {
  try {
    const { officeId } = req.params;

    const query = `
      SELECT
        cm.cm_id,
        cm.name,
        cm.office_id,
        cm.created_at
      FROM care_managers cm
      WHERE cm.office_id = $1
      ORDER BY cm.name
    `;

    const result = await db.query(query, [officeId]);

    res.json({
      success: true,
      count: result.rows.length,
      managers: result.rows
    });
  } catch (error) {
    console.error('Error fetching care managers by office:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch care managers'
    });
  }
};

// ケアマネージャー新規登録
const createCareManager = async (req, res) => {
  try {
    const { name, office_id } = req.body;

    // バリデーション
    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'ケアマネージャー名は必須です'
      });
    }

    // 事業所の存在確認（office_idが指定された場合）
    if (office_id) {
      const officeQuery = 'SELECT office_id FROM care_offices WHERE office_id = $1';
      const officeResult = await db.query(officeQuery, [office_id]);

      if (officeResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: '指定された事業所が存在しません'
        });
      }
    }

    // 重複チェック（同じ事業所に同名のケアマネージャーがいないか）
    const checkQuery = `
      SELECT cm_id FROM care_managers
      WHERE name = $1 AND ($2::integer IS NULL OR office_id = $2)
    `;
    const checkResult = await db.query(checkQuery, [name, office_id || null]);

    if (checkResult.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: '同名のケアマネージャーが既に存在します'
      });
    }

    // 新規登録
    const insertQuery = `
      INSERT INTO care_managers (name, office_id)
      VALUES ($1, $2)
      RETURNING cm_id, name, office_id, created_at, updated_at
    `;

    const result = await db.query(insertQuery, [name, office_id || null]);

    // 事業所情報も含めて返す
    if (office_id) {
      const fullQuery = `
        SELECT
          cm.cm_id,
          cm.name,
          cm.office_id,
          co.name as office_name,
          co.address as office_address,
          cm.created_at,
          cm.updated_at
        FROM care_managers cm
        LEFT JOIN care_offices co ON cm.office_id = co.office_id
        WHERE cm.cm_id = $1
      `;
      const fullResult = await db.query(fullQuery, [result.rows[0].cm_id]);

      res.status(201).json({
        success: true,
        message: 'ケアマネージャーを登録しました',
        manager: fullResult.rows[0]
      });
    } else {
      res.status(201).json({
        success: true,
        message: 'ケアマネージャーを登録しました',
        manager: result.rows[0]
      });
    }
  } catch (error) {
    console.error('Error creating care manager:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create care manager'
    });
  }
};

// ケアマネージャー更新
const updateCareManager = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, office_id } = req.body;

    // 存在確認
    const checkQuery = 'SELECT cm_id FROM care_managers WHERE cm_id = $1';
    const checkResult = await db.query(checkQuery, [id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'ケアマネージャーが見つかりません'
      });
    }

    // 事業所の存在確認（office_idが指定された場合）
    if (office_id !== undefined && office_id !== null) {
      const officeQuery = 'SELECT office_id FROM care_offices WHERE office_id = $1';
      const officeResult = await db.query(officeQuery, [office_id]);

      if (officeResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: '指定された事業所が存在しません'
        });
      }
    }

    // 更新クエリ構築
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(name);
    }

    if (office_id !== undefined) {
      updates.push(`office_id = $${paramCount++}`);
      values.push(office_id);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: '更新する項目がありません'
      });
    }

    values.push(id);
    const updateQuery = `
      UPDATE care_managers
      SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE cm_id = $${paramCount}
      RETURNING *
    `;

    const result = await db.query(updateQuery, values);

    // 事業所情報も含めて返す
    const fullQuery = `
      SELECT
        cm.cm_id,
        cm.name,
        cm.office_id,
        co.name as office_name,
        co.address as office_address,
        cm.created_at,
        cm.updated_at
      FROM care_managers cm
      LEFT JOIN care_offices co ON cm.office_id = co.office_id
      WHERE cm.cm_id = $1
    `;
    const fullResult = await db.query(fullQuery, [result.rows[0].cm_id]);

    res.json({
      success: true,
      message: 'ケアマネージャー情報を更新しました',
      manager: fullResult.rows[0]
    });
  } catch (error) {
    console.error('Error updating care manager:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update care manager'
    });
  }
};

// ケアマネージャー削除
const deleteCareManager = async (req, res) => {
  try {
    const { id } = req.params;

    // 関連する患者の存在確認
    const checkPatientQuery = 'SELECT patientid FROM patients WHERE cm_id = $1 LIMIT 1';
    const checkPatientResult = await db.query(checkPatientQuery, [id]);

    if (checkPatientResult.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'このケアマネージャーを担当とする患者が存在するため削除できません'
      });
    }

    // 削除実行
    const deleteQuery = 'DELETE FROM care_managers WHERE cm_id = $1 RETURNING *';
    const result = await db.query(deleteQuery, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'ケアマネージャーが見つかりません'
      });
    }

    res.json({
      success: true,
      message: 'ケアマネージャーを削除しました',
      manager: result.rows[0]
    });
  } catch (error) {
    console.error('Error deleting care manager:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete care manager'
    });
  }
};

module.exports = {
  getAllCareManagers,
  getCareManagersByOffice,
  createCareManager,
  updateCareManager,
  deleteCareManager
};