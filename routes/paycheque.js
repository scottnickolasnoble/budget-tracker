const express = require('express');
const pool = require('../db/pool');
const isAuthenticated = require('../middleware/isAuthenticated');

const router = express.Router();
router.use(isAuthenticated);

const FREQUENCIES = ['weekly', 'biweekly', 'semimonthly', 'monthly'];

// GET: your pay settings, or null if you haven't set them up yet
router.get('/', async function(request, response) {
  try {
    const result = await pool.query('SELECT * FROM pay_settings WHERE user_id = $1', [request.session.userId]);
    response.json(result.rows[0] ?? null);
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: 'Could not load your pay settings' });
  }
});

// PUT: create or replace your settings (one row per user)
router.put('/', async function(request, response) {
  try {
    const { amount, frequency, anchorDate, savingsPlan, incomeCategoryId } = request.body;
    const userId = request.session.userId;

    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      return response.status(400).json({ error: 'Enter your take-home pay' });
    }
    if (!FREQUENCIES.includes(frequency)) {
      return response.status(400).json({ error: 'Choose how often you get paid' });
    }
    if (typeof anchorDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(anchorDate)) {
      return response.status(400).json({ error: 'Choose a payday' });
    }

    // Optional: the category your paycheques are logged under. Must be yours.
    let incomeCategory = null;
    if (incomeCategoryId !== undefined && incomeCategoryId !== null && incomeCategoryId !== '') {
      const id = Number(incomeCategoryId);
      if (!Number.isInteger(id)) {
        return response.status(400).json({ error: 'Choose one of your categories' });
      }
      const owned = await pool.query('SELECT id FROM categories WHERE id = $1 AND user_id = $2', [id, userId]);
      if (owned.rowCount === 0) {
        return response.status(400).json({ error: 'Choose one of your categories' });
      }
      incomeCategory = id;
    }

    // savingsPlan: [{ accountId, amount }] — every account must be one of your savings goals
    const plan = Array.isArray(savingsPlan) ? savingsPlan : [];
    if (plan.length > 30) {
      return response.status(400).json({ error: 'Too many savings lines' });
    }
    const cleanPlan = [];
    if (plan.length) {
      const owned = await pool.query("SELECT id FROM accounts WHERE user_id = $1 AND kind = 'savings'", [userId]);
      const ownedIds = new Set(owned.rows.map(function(row) { return row.id; }));
      for (const line of plan) {
        const accountId = Number(line?.accountId);
        const lineAmount = Number(line?.amount);
        if (!ownedIds.has(accountId)) {
          return response.status(400).json({ error: 'Choose one of your savings goals' });
        }
        if (!Number.isFinite(lineAmount) || lineAmount < 0) {
          return response.status(400).json({ error: 'Savings amounts must be 0 or more' });
        }
        cleanPlan.push({ accountId, amount: Math.round(lineAmount * 100) / 100 });
      }
    }

    // "Upsert": insert, or update the row that's already there
    const result = await pool.query(`
      INSERT INTO pay_settings (user_id, amount, frequency, anchor_date, savings_plan, income_category_id)
      VALUES ($1, $2, $3, $4, $5::jsonb, $6)
      ON CONFLICT (user_id) DO UPDATE
      SET amount = EXCLUDED.amount,
          frequency = EXCLUDED.frequency,
          anchor_date = EXCLUDED.anchor_date,
          savings_plan = EXCLUDED.savings_plan,
          income_category_id = EXCLUDED.income_category_id
      RETURNING *
    `, [userId, value, frequency, anchorDate, JSON.stringify(cleanPlan), incomeCategory]);
    response.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: 'Could not save your pay settings' });
  }
});

module.exports = router;
