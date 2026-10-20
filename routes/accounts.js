const express = require('express');
const pool = require('../db/pool');
const isAuthenticated = require('../middleware/isAuthenticated');

const router = express.Router();
router.use(isAuthenticated);

const KINDS = ['savings', 'loan'];

// Optional number field: empty -> null, otherwise must be a number in range.
function optionalNumber(value, min, max) {
  if (value === undefined || value === null || value === '') {
    return { value: null };
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    return { invalid: true };
  }
  return { value: number };
}

// Checks the request body. Returns { error } or { values } in the order
// the INSERT/UPDATE queries below expect.
async function validateAccount(body, userId) {
  const { kind, name, categoryId, targetAmount, startingBalance, startDate, interestRate, monthlyPayment } = body;

  if (!KINDS.includes(kind)) {
    return { error: 'Choose savings goal or loan' };
  }

  const trimmedName = typeof name === 'string' ? name.trim() : '';
  if (trimmedName === '' || trimmedName.length > 60) {
    return { error: 'Give it a name (60 characters max)' };
  }

  const target = Number(targetAmount);
  if (!Number.isFinite(target) || target <= 0) {
    return { error: kind === 'loan' ? 'Enter the original loan amount' : 'Enter a goal amount' };
  }

  const starting = Number(startingBalance ?? 0);
  if (!Number.isFinite(starting) || starting < 0) {
    return { error: 'The starting balance can’t be negative' };
  }

  if (typeof startDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return { error: 'Choose a start date' };
  }

  let rate = null;
  let payment = null;
  if (kind === 'loan') {
    const rateCheck = optionalNumber(interestRate, 0, 100);
    if (rateCheck.invalid) {
      return { error: 'Interest rate must be between 0 and 100' };
    }
    const paymentCheck = optionalNumber(monthlyPayment, 0.01, 1000000000);
    if (paymentCheck.invalid) {
      return { error: 'Monthly payment must be more than 0' };
    }
    rate = rateCheck.value;
    payment = paymentCheck.value;
  }

  // The category has to belong to THIS user. Without this check someone
  // could link their account to another user's category id (IDOR again).
  const id = Number(categoryId);
  if (!Number.isInteger(id)) {
    return { error: 'Choose a category' };
  }
  const owned = await pool.query('SELECT id FROM categories WHERE id = $1 AND user_id = $2', [id, userId]);
  if (owned.rowCount === 0) {
    return { error: 'Choose one of your categories' };
  }

  return { values: [kind, trimmedName, id, target, starting, startDate, rate, payment] };
}

// GET: every account plus how much has moved through its category.
// -t.amount turns an expense (-520) into +520, so:
//   savings balance = starting_balance + contributed
//   loan balance    = starting_balance - contributed
router.get('/', async function(request, response) {
  try {
    const result = await pool.query(`
      SELECT
        a.*,
        c.name  AS category_name,
        c.color AS category_color,
        COALESCE(SUM(-t.amount), 0) AS contributed,
        COALESCE(SUM(-t.amount) FILTER (WHERE t.date >= date_trunc('month', CURRENT_DATE)), 0) AS contributed_this_month
      FROM accounts a
      JOIN categories c ON c.id = a.category_id
      LEFT JOIN transactions t
        ON t.category_id = a.category_id
       AND t.user_id = a.user_id
       AND t.date >= a.start_date
      WHERE a.user_id = $1
      GROUP BY a.id, c.name, c.color
      ORDER BY a.created_at, a.id
    `, [request.session.userId]);
    response.json(result.rows);
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: 'Could not load savings and loans' });
  }
});

router.post('/', async function(request, response) {
  try {
    const check = await validateAccount(request.body, request.session.userId);
    if (check.error) {
      return response.status(400).json({ error: check.error });
    }
    const result = await pool.query(`
      INSERT INTO accounts
        (kind, name, category_id, target_amount, starting_balance, start_date, interest_rate, monthly_payment, user_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [...check.values, request.session.userId]);
    response.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: 'Could not save' });
  }
});

router.patch('/:id', async function(request, response) {
  try {
    const check = await validateAccount(request.body, request.session.userId);
    if (check.error) {
      return response.status(400).json({ error: check.error });
    }
    const result = await pool.query(`
      UPDATE accounts
      SET kind = $1, name = $2, category_id = $3, target_amount = $4,
          starting_balance = $5, start_date = $6, interest_rate = $7, monthly_payment = $8
      WHERE id = $9 AND user_id = $10
      RETURNING *
    `, [...check.values, request.params.id, request.session.userId]);
    if (result.rowCount === 0) {
      return response.status(404).json({ error: 'Not found' });
    }
    response.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: 'Could not save' });
  }
});

router.delete('/:id', async function(request, response) {
  try {
    const result = await pool.query(
      'DELETE FROM accounts WHERE id = $1 AND user_id = $2',
      [request.params.id, request.session.userId]
    );
    if (result.rowCount === 0) {
      return response.status(404).json({ error: 'Not found' });
    }
    response.json({ message: 'Deleted' });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: 'Could not delete' });
  }
});

module.exports = router;
