function validateRegister(req, res, next){
  const { email, password, securityQuestion, securityAnswer } = req.body;
  if (email === undefined || password === undefined || password.length < 8 ||
      securityQuestion === undefined || securityQuestion === '' ||
      securityAnswer === undefined || securityAnswer.trim() === '') {
    return res.status(400).json({ error: 'Email, an 8+ character password, a security question, and an answer are all required' });
  }
  next();
}
module.exports = validateRegister;

module.exports = validateRegister;