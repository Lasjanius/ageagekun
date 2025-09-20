const db = require('../config/database');

// 居宅介護支援事業所一覧取得
const getAllCareOffices = async (req, res) => {
  try {
    const query = `
      SELECT
        office_id,
        name,
        address,
        created_at,
        updated_at
      FROM care_offices
      ORDER BY name
    `;

    const result = await db.query(query);

    res.json({
      success: true,
      count: result.rows.length,
      offices: result.rows
    });
  } catch (error) {
    console.error('Error fetching care offices:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch care offices'
    });
  }
};

// 居宅介護支援事業所新規登録
const createCareOffice = async (req, res) => {
  try {
    const { name, address } = req.body;

    // バリデーション
    if (!name) {
      return res.status(400).json({
        success: false,
        error: '事業所名は必須です'
      });
    }

    // 重複チェック
    const checkQuery = 'SELECT office_id FROM care_offices WHERE name = $1';
    const checkResult = await db.query(checkQuery, [name]);

    if (checkResult.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: '同名の事業所が既に存在します'
      });
    }

    // 新規登録
    const insertQuery = `
      INSERT INTO care_offices (name, address)
      VALUES ($1, $2)
      RETURNING *
    `;

    const result = await db.query(insertQuery, [name, address || null]);

    res.status(201).json({
      success: true,
      message: '居宅介護支援事業所を登録しました',
      office: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating care office:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create care office'
    });
  }
};

// 居宅介護支援事業所更新
const updateCareOffice = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, address } = req.body;

    // 存在確認
    const checkQuery = 'SELECT office_id FROM care_offices WHERE office_id = $1';
    const checkResult = await db.query(checkQuery, [id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: '事業所が見つかりません'
      });
    }

    // 更新クエリ構築
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(name);
    }

    if (address !== undefined) {
      updates.push(`address = $${paramCount++}`);
      values.push(address);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: '更新する項目がありません'
      });
    }

    values.push(id);
    const updateQuery = `
      UPDATE care_offices
      SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE office_id = $${paramCount}
      RETURNING *
    `;

    const result = await db.query(updateQuery, values);

    res.json({
      success: true,
      message: '居宅介護支援事業所を更新しました',
      office: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating care office:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update care office'
    });
  }
};

// 居宅介護支援事業所削除
const deleteCareOffice = async (req, res) => {
  try {
    const { id } = req.params;

    // 関連するケアマネージャーの存在確認
    const checkCMQuery = 'SELECT cm_id FROM care_managers WHERE office_id = $1 LIMIT 1';
    const checkCMResult = await db.query(checkCMQuery, [id]);

    if (checkCMResult.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'この事業所に所属するケアマネージャーが存在するため削除できません'
      });
    }

    // 削除実行
    const deleteQuery = 'DELETE FROM care_offices WHERE office_id = $1 RETURNING *';
    const result = await db.query(deleteQuery, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: '事業所が見つかりません'
      });
    }

    res.json({
      success: true,
      message: '居宅介護支援事業所を削除しました',
      office: result.rows[0]
    });
  } catch (error) {
    console.error('Error deleting care office:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete care office'
    });
  }
};

module.exports = {
  getAllCareOffices,
  createCareOffice,
  updateCareOffice,
  deleteCareOffice
};