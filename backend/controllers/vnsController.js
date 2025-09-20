const db = require('../config/database');

// 訪問看護ステーション一覧取得
const getAllVNS = async (req, res) => {
  try {
    const query = `
      SELECT
        vns_id,
        name,
        address,
        tel,
        created_at,
        updated_at
      FROM visiting_nurse_stations
      ORDER BY name
    `;

    const result = await db.query(query);

    res.json({
      success: true,
      count: result.rows.length,
      stations: result.rows
    });
  } catch (error) {
    console.error('Error fetching visiting nurse stations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch visiting nurse stations'
    });
  }
};

// 訪問看護ステーション新規登録
const createVNS = async (req, res) => {
  try {
    const { name, address, tel } = req.body;

    // バリデーション
    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'ステーション名は必須です'
      });
    }

    // 重複チェック
    const checkQuery = 'SELECT vns_id FROM visiting_nurse_stations WHERE name = $1';
    const checkResult = await db.query(checkQuery, [name]);

    if (checkResult.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: '同名のステーションが既に存在します'
      });
    }

    // 新規登録
    const insertQuery = `
      INSERT INTO visiting_nurse_stations (name, address, tel)
      VALUES ($1, $2, $3)
      RETURNING *
    `;

    const result = await db.query(insertQuery, [
      name,
      address || null,
      tel || null
    ]);

    res.status(201).json({
      success: true,
      message: '訪問看護ステーションを登録しました',
      station: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating visiting nurse station:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create visiting nurse station'
    });
  }
};

// 訪問看護ステーション更新
const updateVNS = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, address, tel } = req.body;

    // 存在確認
    const checkQuery = 'SELECT vns_id FROM visiting_nurse_stations WHERE vns_id = $1';
    const checkResult = await db.query(checkQuery, [id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'ステーションが見つかりません'
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

    if (tel !== undefined) {
      updates.push(`tel = $${paramCount++}`);
      values.push(tel);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: '更新する項目がありません'
      });
    }

    values.push(id);
    const updateQuery = `
      UPDATE visiting_nurse_stations
      SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE vns_id = $${paramCount}
      RETURNING *
    `;

    const result = await db.query(updateQuery, values);

    res.json({
      success: true,
      message: '訪問看護ステーション情報を更新しました',
      station: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating visiting nurse station:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update visiting nurse station'
    });
  }
};

// 訪問看護ステーション削除
const deleteVNS = async (req, res) => {
  try {
    const { id } = req.params;

    // 関連する患者の存在確認
    const checkPatientQuery = 'SELECT patientid FROM patients WHERE vns_id = $1 LIMIT 1';
    const checkPatientResult = await db.query(checkPatientQuery, [id]);

    if (checkPatientResult.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'このステーションを利用する患者が存在するため削除できません'
      });
    }

    // 削除実行
    const deleteQuery = 'DELETE FROM visiting_nurse_stations WHERE vns_id = $1 RETURNING *';
    const result = await db.query(deleteQuery, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'ステーションが見つかりません'
      });
    }

    res.json({
      success: true,
      message: '訪問看護ステーションを削除しました',
      station: result.rows[0]
    });
  } catch (error) {
    console.error('Error deleting visiting nurse station:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete visiting nurse station'
    });
  }
};

module.exports = {
  getAllVNS,
  createVNS,
  updateVNS,
  deleteVNS
};