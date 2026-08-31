function updateCategoryUpdate(req,res,next){
	const { name, color, limit } = req.body;
	
	if(name === undefined || color === undefined || limit === undefined){
		return res.status(400).json({ error: 'Category name, color and limit are all required' });
	}
	next();
}

module.exports = updateCategoryUpdate;