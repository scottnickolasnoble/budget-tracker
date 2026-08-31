const express = require('express');
const router = express.Router();
const fs = require('fs');

router.get('/', async function(request, response){
	const result = await pool.query('SELECT * FROM categories');
	response.json(result.rows);
});
router.post('/', async function(request, response){
	const {name, color, limit} = request.body;
	const result = await pool.query(
		'INSERT INTO categories (name, color, "limit") VALUES ($1, $2, $3) RETURNING *',
		[name, color, limit]
	);
	response.status(201).json(result.rows[0]);
});

module.exports = router;