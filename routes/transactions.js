const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

router.get('/', async function(request, response){
	const fileContents = await pool.query('SELECT * FROM transactions');
	response.json(fileContents);
});
router.post('/', async function(request, response){
	const { date, description, amount, paymentmethod } = request.body;
	const result = await pool.query(
		'INSERT INTO transactions (date, description, amount, paymentmethod) VALUES ($1, $2, $3, $4) RETURNING *',
		[date, description, amount, paymentmethod]
	);
	response.status(201).json(result.rows[0]);
});

module.exports = router;