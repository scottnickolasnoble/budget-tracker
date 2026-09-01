function validateTransaction(req, res, next) {
  const { description, amount, paymentmethod } = req.body;

  if (description === undefined || amount === undefined || paymentmethod === undefined) {
    return res.status(400).json({ error: 'description, amount, and paymentmethod are required' });
  }

  next();
}

module.exports = validateTransaction;