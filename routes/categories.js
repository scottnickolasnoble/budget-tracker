const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const validateCategory = require('../middleware/validateCategory');
const validateCategoryUpdate = require('../middleware/validateCategoryUpdate');

const isAuthenticated = require('../middleware/isAuthenticated');

router.use(isAuthenticated); 

router.get('/', async function(request, response){
	const user_id = request.session.userId;
	const result = await pool.query('SELECT * FROM categories WHERE user_id = $1', [user_id]);
	response.json(result.rows);
});
router.post('/', validateCategory, async function(request, response){
	const {name, color, limit} = request.body;
	const user_id = request.session.userId;
	const limitValue = limit === '' ? null : limit;
	const result = await pool.query(
		'INSERT INTO categories (name, color, "limit", user_id) VALUES ($1, $2, $3, $4) RETURNING *',
		[name, color, limitValue, user_id]
	);
	response.status(201).json(result.rows[0]);
});
router.delete('/:id', async function(request, response){
	const { id } = request.params;
	const user_id = request.session.userId;
	try{
	const result = await pool.query('DELETE FROM categories WHERE id = $1 AND user_id = $2', [id, user_id]);
	
	if(result.rowCount === 0){
		return response.status(404).json({error: 'Category not found'});
	}
	response.status(200).json({message: "Deleted"});
	}
	catch (error) {
		response.status(409).json({error: "Cannot delete category - it is still being used by existing transactions"});
	}
});
router.patch('/:id', validateCategoryUpdate, async function(request, response){
	const { id } = request.params;
	const { name, color, limit } = request.body;
	const user_id = request.session.userId;
	const limitValue = limit === '' ? null : limit;
	
	const result = await pool.query('UPDATE categories SET name = $1, color = $2, "limit" = $3 WHERE id = $4 AND user_id = $5 RETURNING *', [name, color, limitValue, id, user_id]);
	
	if(result.rowCount === 0){
		return response.status(404).json({error: "Category not Found"});
	}
	
	response.status(200).json(result.rows[0]);
});

module.exports = router;