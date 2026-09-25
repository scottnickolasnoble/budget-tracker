const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const pool = require('../db/pool');
const validateRegister = require('../middleware/validateRegister');
const loginLimiter = require('../middleware/loginLimiter');
const isAuthenticated = require('../middleware/isAuthenticated');

async function verifyCurrentPassword(userId, password) {
  const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
  if (result.rows.length === 0) {
    return false;
  }
  return bcrypt.compare(password, result.rows[0].password_hash);
}

router.get('/me', isAuthenticated, async function(request, response) {
  const user_id = request.session.userId;
  const result = await pool.query(
    'SELECT id, email, has_seen_tutorial, security_question FROM users WHERE id = $1',
    [user_id]
  );
  response.json(result.rows[0]);
});

router.patch('/tutorial-seen', isAuthenticated, async function(request, response) {
  const user_id = request.session.userId;
  await pool.query('UPDATE users SET has_seen_tutorial = true WHERE id = $1', [user_id]);
  response.status(200).json({ message: 'Tutorial marked as seen' });
});
router.post('/register', validateRegister, async function(request, response){
  const { email, password, securityQuestion, securityAnswer } = request.body;
  const password_hash = await bcrypt.hash(password, 10);
  const answer_hash = await bcrypt.hash(securityAnswer.trim().toLowerCase(), 10);

  try {
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, security_question, security_answer_hash) VALUES ($1, $2, $3, $4) RETURNING id',
      [email, password_hash, securityQuestion, answer_hash]
    );
    const { id } = result.rows[0];
    response.status(201).json({ id, email });
  } catch (error) {
    if (error.code === '23505') {
      return response.status(409).json({ error: 'An account with that email already exists' });
    }
    response.status(500).json({ error: 'Could not create account' });
  }
});
router.post('/forgot/question', loginLimiter, async function(request, response){
  const { email } = request.body;
  const result = await pool.query('SELECT security_question FROM users WHERE email = $1', [email]);

  if (result.rows.length === 0 || result.rows[0].security_question === null) {
    return response.status(404).json({ error: "We couldn't find a security question for that email" });
  }

  response.json({ question: result.rows[0].security_question });
});

router.post('/forgot/reset', loginLimiter, async function(request, response){
  const { email, answer, newPassword } = request.body;

  if (!email || !answer || !newPassword || newPassword.length < 8) {
    return response.status(400).json({ error: 'Enter your answer and a new password of at least 8 characters' });
  }

  const result = await pool.query('SELECT id, security_answer_hash FROM users WHERE email = $1', [email]);

  if (result.rows.length === 0 || result.rows[0].security_answer_hash === null) {
    return response.status(400).json({ error: 'Unable to reset password for that account' });
  }

  const user = result.rows[0];
  const answerMatches = await bcrypt.compare(answer.trim().toLowerCase(), user.security_answer_hash);

  if (!answerMatches) {
    return response.status(401).json({ error: "That answer doesn't match" });
  }

  const newHash = await bcrypt.hash(newPassword, 10);
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, user.id]);
  response.json({ message: 'Password updated' });
});
router.post('/login', loginLimiter, async function(request, response){
	const { email, password } = request.body;
	 
	const result = await pool.query(`SELECT * FROM users WHERE email = $1`, [email]);
	
	if(result.rows.length === 0){
		return response.status(401).json({ error: 'Invalid email or password'});
	} 
	
	const user = result.rows[0];
	
	const passwordMatches = await bcrypt.compare(password, user.password_hash);
	
	if (!passwordMatches){
		return response.status(401).json({error: "Invalid email or password"})
	}
	
	request.session.userId = user.id;
	response.status(200).json({id: user.id, email: user.email});
});

router.post('/logout', function(request,response){
	request.session.destroy(function(err){
		if(err){
		return response.status(500).json({error: 'Could not log out'});
		}
		response.status(200).json({message: 'Logged out'});
	});
});

router.patch('/password', isAuthenticated, loginLimiter, async function(request, response) {
  const { currentPassword, newPassword } = request.body;

  if (!currentPassword || !newPassword || newPassword.length < 8) {
    return response.status(400).json({ error: 'Enter your current password and a new password of at least 8 characters' });
  }

  const passwordMatches = await verifyCurrentPassword(request.session.userId, currentPassword);
  if (!passwordMatches) {
    return response.status(401).json({ error: 'Your current password is incorrect' });
  }

  const newHash = await bcrypt.hash(newPassword, 10);
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, request.session.userId]);
  response.json({ message: 'Password updated' });
});

router.patch('/security-question', isAuthenticated, loginLimiter, async function(request, response) {
  const { currentPassword, securityQuestion, securityAnswer } = request.body;

  if (!currentPassword || !securityQuestion || !securityAnswer || securityAnswer.trim() === '') {
    return response.status(400).json({ error: 'Choose a question, enter an answer, and enter your current password' });
  }

  const passwordMatches = await verifyCurrentPassword(request.session.userId, currentPassword);
  if (!passwordMatches) {
    return response.status(401).json({ error: 'Your current password is incorrect' });
  }

  const answerHash = await bcrypt.hash(securityAnswer.trim().toLowerCase(), 10);
  await pool.query(
    'UPDATE users SET security_question = $1, security_answer_hash = $2 WHERE id = $3',
    [securityQuestion, answerHash, request.session.userId]
  );
  response.json({ message: 'Security question updated' });
});
module.exports = router;