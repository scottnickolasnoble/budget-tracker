/*
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
	connectionString: process.env.DATABASE_URL,
	ssl: { rejectUnauthorized: false }
});

pool.query('SELECT NOW()')
.then(result => console.log('Database connected:', result.rows[0]))
.catch(err => console.error('Database connection failed:', err));
*/
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
app.use(express.text());
app.use(express.static('.'));

const transactionsRouter = require('./routes/transactions');
app.use('/api/transactions', transactionsRouter);

const categoriesRouter = require('./routes/categories');
app.use('/api/categories', categoriesRouter);

const statementsRouter = require('./routes/statements');
app.use('/api/statements', statementsRouter);

app.listen(3000, function() {
	console.log('Server running on http://localhost:3000');
});
