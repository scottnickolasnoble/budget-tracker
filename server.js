require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
	connectionString: process.env.DATABASE_URL,
	ssl: { rejectUnauthorized: false }
});

pool.query('SELECT NOW()')
.then(result => console.log('Database connected:', result.rows[0]))
.catch(err => console.error('Database connection failed:', err));
// Pull in Node's built-in file system tool — this is what lets
// this file actually read and write real files on disk (like your
// transactions.csv). It's built into Node, so no install needed.
const fs = require('fs');

// Pull in the Express package — the library you installed via npm
// that makes building a server (routes, middleware, etc.) much
// easier than writing raw Node from scratch.
const express = require("express");

// Create the actual application object. Calling express() as a
// function gives you back this central "app" — every route and
// setting from here on is defined by calling a method on it.
const app = express();

app.use(express.json());

app.use(express.static('.'));

const session = require('express-session');
app.use(session({
	secret: process.env.SESSION_SECRET,
	resave: false,
	saveUninitialized: false,
	cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));
const transactionsRouter = require('./routes/transactions');
app.use('/api/transactions', transactionsRouter);

const categoriesRouter = require('./routes/categories');
app.use('/api/categories', categoriesRouter);

const statementsRouter = require('./routes/statements');
app.use('/api/statements', statementsRouter);

const authRouter = require('./routes/auth');
app.use('/api/auth', authRouter);

const widgetRouter = require('./routes/widgets');
app.use('/api/widgets', widgetRouter);

const accountsRouter = require('./routes/accounts');   // ← new
app.use('/api/accounts', accountsRouter); 

const billsRouter = require('./routes/bills');      // ← new
app.use('/api/bills', billsRouter);                 // ← new

const wishlistRouter = require('./routes/wishlist');
app.use('/api/wishlist', wishlistRouter);
const paychequeRouter = require('./routes/paycheque');
app.use('/api/paycheque', paychequeRouter);
const keyListRouter = require('./routes/keyList');
app.use('/api/subscription-ignores', keyListRouter('subscription_ignores'));
app.use('/api/insight-dismissals', keyListRouter('insight_dismissals'));


app.listen(3000, function() {
	console.log('Server running on http://localhost:3000');
});
