const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	max: 20,
	message: { error: 'Too many login attemps, please try again later'}
});

module.exports = loginLimiter;