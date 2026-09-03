const express = require('express');
const pool = require('../db/pool');
const router = express.Router();
const isAuthenticated = require('../middleware/isAuthenticated');

router.use(isAuthenticated); 

router.get('/', async function(request, response){
	const fileContents = await pool.query('SELECT * FROM widgets');
	response.json(fileContents.rows);
});

router.post('/', async function(request, response){
	const { type, position, span, config } = request.body;
	const result = await pool.query(`INSERT INTO widgets (type, position, span, config) VALUES ($1, $2, $3, $4::jsonb) RETURNING *`,[type, position, span, config]);
	
	response.status(201).json(result.rows[0]);
});

router.delete('/:id', async function(request, response){
	const { id } = request.params;
	const result = await pool.query('DELETE FROM widgets WHERE id = $1', [id]);
	response.status(200).json({message: 'Deleted'});
});

router.patch('/:id', async function(request, response){
	const { id } = request.params;
	const { type, position, span, config } = request.body;
	
	const result = await pool.query(`UPDATE widgets SET type = $1, position = $2, span = $3,
	config = $4::jsonb
	WHERE id = $5 RETURNING *`, [type, position, span, config, id]);
	
	response.status(200).json(result.rows[0]);
});

module.exports = router;