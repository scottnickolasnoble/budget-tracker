const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const validateTransactions = require('../middleware/validateTransactions');
const validateTransactionUpdate = require('../middleware/validateTransactionUpdate');
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

router.delete('/:id', async function(request, response){
	const { id } = request.params;
	const result = await pool.query('DELETE FROM transactions WHERE id = $1', [id]);
	response.status(200).json({message: 'Deleted'});
});

router.patch('/:id', validateTransactionUpdate, async function(request, response){
	const { id } = request.params;
	const { date, description, amount, paymentmethod, category_id} = request.body;
	
	const result = await pool.query(`UPDATE transactions SET date = $1, description = $2, amount = $3,
	paymentmethod = $4, category_id = $5
	WHERE id = $6 RETURNING *`, [date, description, amount, paymentmethod, category_id, id]);
	
	response.status(200).json(result.rows[0]);
});

module.exports = router;