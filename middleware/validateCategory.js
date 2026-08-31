function validateCategory(req, res, next){
	const { name } = req.body;

  if (name === undefined) {
    return res.status(400).json({ error: 'Category name is required' });
  }

  next();
}

module.exports = validateCategory;