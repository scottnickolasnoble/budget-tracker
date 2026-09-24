const express = require('express');
const pool = require('../db/pool');
const router = express.Router();
const isAuthenticated = require('../middleware/isAuthenticated');

router.use(isAuthenticated); 

router.get('/', async function(request, response){
	const user_id = request.session.userId;
	const fileContents = await pool.query('SELECT * FROM widgets WHERE user_id = $1', [user_id]);
	response.json(fileContents.rows);
});

router.post('/', async function(request, response){
	const { type, position, span, config } = request.body;
	const user_id = request.session.userId;
	const result = await pool.query(`INSERT INTO widgets (type, position, span, config, user_id) VALUES ($1, $2, $3, $4::jsonb, $5) RETURNING *`,[type, position, span, config, user_id]);
	
	response.status(201).json(result.rows[0]);
});

router.delete('/:id', async function(request, response){
	const { id } = request.params;
	const user_id = request.session.userId;
	const result = await pool.query('DELETE FROM widgets WHERE id = $1 AND user_id = $2', [id,user_id]);
	if(result.rowCount === 0){
		return response.status(404).json({error: "Widget doesn't exist"});
	}
	
	response.status(200).json({message: 'Deleted'});
});

router.patch('/:id', async function(request, response){
	const { id } = request.params;
	const { type, position, span, config } = request.body;
	const user_id = request.session.userId;
	
	const result = await pool.query(`UPDATE widgets SET type = $1, position = $2, span = $3,
	config = $4::jsonb
	WHERE id = $5 AND user_id = $6 RETURNING *`, [type, position, span, config, id, user_id]);
	
	if(result.rowCount === 0){
		return response.status(404).json({error: "Widget doesn't exist"});
	}
	response.status(200).json(result.rows[0]);
});

module.exports = router;