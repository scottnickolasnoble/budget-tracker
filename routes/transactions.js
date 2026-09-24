const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const validateTransactions = require('../middleware/validateTransactions');
const validateTransactionUpdate = require('../middleware/validateTransactionUpdate');
const isAuthenticated = require('../middleware/isAuthenticated');

router.use(isAuthenticated); 

router.get('/', async function(request, response){
	const user_id = request.session.userId;
	const fileContents = await pool.query('SELECT * FROM transactions WHERE user_id = $1', [user_id]);
	response.json(fileContents.rows);
});
router.post('/', validateTransactions, async function(request, response){
	const { date, description, amount, paymentmethod, category_id } = request.body;
	const user_id = request.session.userId;
	
	const result = await pool.query(
		'INSERT INTO transactions (date, description, amount, paymentmethod, category_id, user_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
		[date, description, amount, paymentmethod, category_id, user_id]
	);
	response.status(201).json(result.rows[0]);
});

router.delete('/:id', async function(request, response){
	const { id } = request.params;
	const user_id = request.session.userId;
	const result = await pool.query('DELETE FROM transactions WHERE id = $1 AND user_id = $2', [id, user_id]);
	
	if(result.rowCount === 0){
		return response.status(404).json({error: 'Transaction not found'});
	}
	response.status(200).json({message: 'Deleted'});
});

router.patch('/:id', validateTransactionUpdate, async function(request, response){
	const { id } = request.params;
	const user_id = request.session.userId;
	const { date, description, amount, paymentmethod, category_id} = request.body;
	
	const result = await pool.query(`UPDATE transactions SET date = $1, description = $2, amount = $3,
	paymentmethod = $4, category_id = $5
	WHERE id = $6 AND user_id = $7 RETURNING *`, [date, description, amount, paymentmethod, category_id, id, user_id]);
	
	if(result.rowCount === 0){
		return response.status(404).json({error: 'Transaction not found'});
	}
	response.status(200).json(result.rows[0]);
});

module.exports = router;