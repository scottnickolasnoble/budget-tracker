// Builds a tiny router for "lists of keys" a user has saved:
// GET / -> ["key1", "key2"], POST / { key } -> add, DELETE /:key -> remove.
// Used for ignored subscriptions and dismissed insights, which work the same way.
const express = require('express');
const pool = require('../db/pool');
const isAuthenticated = require('../middleware/isAuthenticated');

// The table name is passed in by OUR code (never from a request),
// so putting it in the SQL string is safe here.
function keyListRouter(table) {
  const router = express.Router();
  router.use(isAuthenticated);

  router.get('/', async function(request, response) {
    try {
      const result = await pool.query(`SELECT key FROM ${table} WHERE user_id = $1`, [request.session.userId]);
      response.json(result.rows.map(function(row) { return row.key; }));
    } catch (error) {
      console.error(error);
      response.status(500).json({ error: 'Could not load' });
    }
  });

  router.post('/', async function(request, response) {
    try {
      const { key } = request.body;
      if (typeof key !== 'string' || key.length === 0 || key.length > 200) {
        return response.status(400).json({ error: 'Bad key' });
      }
      await pool.query(
        `INSERT INTO ${table} (user_id, key) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [request.session.userId, key]
      );
      response.status(201).json({ message: 'Saved' });
    } catch (error) {
      console.error(error);
      response.status(500).json({ error: 'Could not save' });
    }
  });

  router.delete('/:key', async function(request, response) {
    try {
      await pool.query(`DELETE FROM ${table} WHERE user_id = $1 AND key = $2`, [request.session.userId, request.params.key]);
      response.json({ message: 'Removed' });
    } catch (error) {
      console.error(error);
      response.status(500).json({ error: 'Could not remove' });
    }
  });

  return router;
}

module.exports = keyListRouter;
