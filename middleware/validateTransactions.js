function validateTransaction(req, res, next) {
  const { description, amount, paymentMethod } = req.body;

  if (description === undefined || amount === undefined || paymentMethod === undefined) {
    return res.status(400).json({ error: 'description, amount, and paymentMethod are required' });
  }

  next();
}

module.exports = validateTransaction;