function validateTransactionUpdate(req,res,next){
	const { date, description, amount, paymentmethod, category_id } = req.body;

  if (date === undefined || description === undefined || amount === undefined || paymentmethod === undefined || category_id === undefined) {
    return res.status(400).json({ error: 'Date, description, amount, paymentmethod, and category_id are all required' });
  }

  next();
}

module.exports = validateTransactionUpdate;