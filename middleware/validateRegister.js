function validateRegister(req, res, next){
	const { email, password } = req.body;
	if(email === undefined || password === undefined || password.length < 8){
		return res.status(400).json({ error: 'Password must be min 8 characters, and both email and password are both required' });
	}
	next();
}

module.exports = validateRegister;