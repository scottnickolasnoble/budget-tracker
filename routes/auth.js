const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const pool = require('../db/pool');
const validateRegister = require('../middleware/validateRegister');

router.post('/register', validateRegister, async function(request, response){
	const {email, password} = request.body;
	const password_hash = await bcrypt.hash(password, 10);
	const result = await pool.query(
		'INSERT INTO users (email,password_hash) VALUES ($1, $2) RETURNING *',
		[email,password_hash]
	);
	const { id } = result.rows[0];
	
	response.status(201).json({id, email});
});

router.post('/login', async function(request, response){
	const { email, password } = request.body;
	 
	const result = await pool.query(`SELECT * FROM users WHERE email = $1`, [email]);
	
	if(result.rows.length === 0){
		return response.status(401).json({ error: 'Invalid Email'});
	} 
	
	const user = result.rows[0];
	
	const passwordMatches = await bcrypt.compare(password, user.password_hash);
	
	if (!passwordMatches){
		return response.status(401).json({error: "Invalid Password"})
	}
	
	request.session.userId = user.id;
	response.status(200).json({id: user.id, email: user.email});
});


module.exports = router;