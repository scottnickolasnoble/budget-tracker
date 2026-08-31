const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const validateTransactions = require('../middleware/validateTransactions');
router.get('/', async function(request, response){
	const fileContents = await pool.query('SELECT * FROM transactions');
	response.json(fileContents.rows);
});
router.post('/', validateTransactions, async function(request, response){
	const { date, description, amount, paymentmethod, category_id } = request.body;
	const result = await pool.query(
		'INSERT INTO transactions (date, description, amount, paymentmethod, category_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
		[date, description, amount, paymentmethod, category_id]
	);
	response.status(201).json(result.rows[0]);
});

module.exports = router;