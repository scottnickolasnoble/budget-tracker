const express = require('express');
const pool = require('../db/pool');
const isAuthenticated = require('../middleware/isAuthenticated');

const router = express.Router();
router.use(isAuthenticated);

const PRIORITIES = ['need', 'want'];
const STATUSES = ['active', 'bought', 'skipped'];

// Checks the body. Returns { error } or { values } in the order the
// INSERT/UPDATE queries below expect.
async function validateItem(body, userId) {
  const { name, price, priority, waitDays, accountId, note, status } = body;

  const trimmedName = typeof name === 'string' ? name.trim() : '';
  if (trimmedName === '' || trimmedName.length > 80) {
    return { error: 'Give it a name (80 characters max)' };
  }

  const value = Number(price);
  if (!Number.isFinite(value) || value <= 0) {
    return { error: 'Enter a price more than 0' };
  }

  if (!PRIORITIES.includes(priority)) {
    return { error: 'Choose need or want' };
  }

  const wait = Number(waitDays ?? 30);
  if (!Number.isInteger(wait) || wait < 0 || wait > 365) {
    return { error: 'Wait time must be 0 to 365 days' };
  }

  const itemStatus = status ?? 'active';
  if (!STATUSES.includes(itemStatus)) {
    return { error: 'Unknown status' };
  }

  // Optional savings goal link: must be one of YOUR savings goals.
  let account = null;
  if (accountId !== undefined && accountId !== null && accountId !== '') {
    const id = Number(accountId);
    if (!Number.isInteger(id)) {
      return { error: 'Choose one of your savings goals' };
    }
    const owned = await pool.query(
      "SELECT id FROM accounts WHERE id = $1 AND user_id = $2 AND kind = 'savings'",
      [id, userId]
    );
    if (owned.rowCount === 0) {
      return { error: 'Choose one of your savings goals' };
    }
    account = id;
  }

  const trimmedNote = typeof note === 'string' && note.trim() !== '' ? note.trim().slice(0, 200) : null;

  return { values: [trimmedName, value, priority, wait, account, trimmedNote, itemStatus] };
}

router.get('/', async function(request, response) {
  try {
    const result = await pool.query(
      'SELECT * FROM wishlist_items WHERE user_id = $1 ORDER BY added_on, id',
      [request.session.userId]
    );
    response.json(result.rows);
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: 'Could not load your wishlist' });
  }
});

router.post('/', async function(request, response) {
  try {
    const check = await validateItem(request.body, request.session.userId);
    if (check.error) {
      return response.status(400).json({ error: check.error });
    }
    const result = await pool.query(`
      INSERT INTO wishlist_items (name, price, priority, wait_days, account_id, note, status, user_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
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
    const check = await validateItem(request.body, request.session.userId);
    if (check.error) {
      return response.status(400).json({ error: check.error });
    }
    // closed_on is set when an item is bought or skipped, cleared if it goes back to active
    const result = await pool.query(`
      UPDATE wishlist_items
      SET name = $1, price = $2, priority = $3, wait_days = $4, account_id = $5, note = $6, status = $7,
          closed_on = CASE WHEN $7 = 'active' THEN NULL ELSE COALESCE(closed_on, CURRENT_DATE) END
      WHERE id = $8 AND user_id = $9
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
      'DELETE FROM wishlist_items WHERE id = $1 AND user_id = $2',
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
