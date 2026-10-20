const express = require('express');
const pool = require('../db/pool');
const isAuthenticated = require('../middleware/isAuthenticated');

const router = express.Router();
router.use(isAuthenticated);

const FREQUENCIES = ['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Checks the request body. Returns { error } or { values } in the order
// the INSERT/UPDATE queries below expect.
async function validateBill(body, userId) {
  const { name, categoryId, amount, frequency, anchorDate, autopay, amountVaries } = body;

  const trimmedName = typeof name === 'string' ? name.trim() : '';
  if (trimmedName === '' || trimmedName.length > 60) {
    return { error: 'Give the bill a name (60 characters max)' };
  }

  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) {
    return { error: 'Enter an amount more than 0' };
  }

  if (!FREQUENCIES.includes(frequency)) {
    return { error: 'Choose how often it repeats' };
  }

  if (typeof anchorDate !== 'string' || !DATE_PATTERN.test(anchorDate)) {
    return { error: 'Choose the next due date' };
  }

  // Same IDOR protection as accounts: the category must be yours.
  const id = Number(categoryId);
  if (!Number.isInteger(id)) {
    return { error: 'Choose a category' };
  }
  const owned = await pool.query('SELECT id FROM categories WHERE id = $1 AND user_id = $2', [id, userId]);
  if (owned.rowCount === 0) {
    return { error: 'Choose one of your categories' };
  }

  return { values: [trimmedName, id, value, frequency, anchorDate, autopay === true, amountVaries === true] };
}

// ---------- bills ----------

router.get('/', async function(request, response) {
  try {
    const result = await pool.query(`
      SELECT b.*, c.name AS category_name, c.color AS category_color
      FROM bills b
      JOIN categories c ON c.id = b.category_id
      WHERE b.user_id = $1
      ORDER BY b.name
    `, [request.session.userId]);
    response.json(result.rows);
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: 'Could not load bills' });
  }
});

// Must come BEFORE any '/:id' GET route, or Express would treat
// "payments" as an id. (There's no '/:id' GET today, but keep it first.)
router.get('/payments', async function(request, response) {
  try {
    const result = await pool.query(
      'SELECT bill_id, due_date, paid_on FROM bill_payments WHERE user_id = $1',
      [request.session.userId]
    );
    response.json(result.rows);
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: 'Could not load payments' });
  }
});

router.post('/', async function(request, response) {
  try {
    const check = await validateBill(request.body, request.session.userId);
    if (check.error) {
      return response.status(400).json({ error: check.error });
    }
    const result = await pool.query(`
      INSERT INTO bills (name, category_id, amount, frequency, anchor_date, autopay, amount_varies, user_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [...check.values, request.session.userId]);
    response.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: 'Could not save the bill' });
  }
});

router.patch('/:id', async function(request, response) {
  try {
    const check = await validateBill(request.body, request.session.userId);
    if (check.error) {
      return response.status(400).json({ error: check.error });
    }
    const result = await pool.query(`
      UPDATE bills
      SET name = $1, category_id = $2, amount = $3, frequency = $4,
          anchor_date = $5, autopay = $6, amount_varies = $7
      WHERE id = $8 AND user_id = $9
      RETURNING *
    `, [...check.values, request.params.id, request.session.userId]);
    if (result.rowCount === 0) {
      return response.status(404).json({ error: 'Not found' });
    }
    response.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: 'Could not save the bill' });
  }
});

router.delete('/:id', async function(request, response) {
  try {
    const result = await pool.query(
      'DELETE FROM bills WHERE id = $1 AND user_id = $2',
      [request.params.id, request.session.userId]
    );
    if (result.rowCount === 0) {
      return response.status(404).json({ error: 'Not found' });
    }
    response.json({ message: 'Deleted' });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: 'Could not delete the bill' });
  }
});

// ---------- marking paid by hand ----------

router.post('/:id/payments', async function(request, response) {
  try {
    const { dueDate } = request.body;
    if (typeof dueDate !== 'string' || !DATE_PATTERN.test(dueDate)) {
      return response.status(400).json({ error: 'Missing due date' });
    }
    // Make sure the bill is yours before recording anything against it.
    const owned = await pool.query('SELECT id FROM bills WHERE id = $1 AND user_id = $2', [request.params.id, request.session.userId]);
    if (owned.rowCount === 0) {
      return response.status(404).json({ error: 'Not found' });
    }
    // ON CONFLICT: clicking "Mark paid" twice doesn't create a duplicate.
    await pool.query(`
      INSERT INTO bill_payments (bill_id, user_id, due_date)
      VALUES ($1, $2, $3)
      ON CONFLICT (bill_id, due_date) DO NOTHING
    `, [request.params.id, request.session.userId, dueDate]);
    response.status(201).json({ message: 'Marked paid' });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: 'Could not mark it paid' });
  }
});

router.delete('/:id/payments/:dueDate', async function(request, response) {
  try {
    if (!DATE_PATTERN.test(request.params.dueDate)) {
      return response.status(400).json({ error: 'Bad date' });
    }
    const result = await pool.query(
      'DELETE FROM bill_payments WHERE bill_id = $1 AND due_date = $2 AND user_id = $3',
      [request.params.id, request.params.dueDate, request.session.userId]
    );
    if (result.rowCount === 0) {
      return response.status(404).json({ error: 'Not found' });
    }
    response.json({ message: 'Unmarked' });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: 'Could not undo' });
  }
});

module.exports = router;
