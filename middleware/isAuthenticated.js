function isAuthenticated(req, res, next){
	const { userId } = req.session;
	
	if(userId === undefined){
		return res.status(401).json({error: "Session has expired"});
	}
	next();
}

module.exports = isAuthenticated;