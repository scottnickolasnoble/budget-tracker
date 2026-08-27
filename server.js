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



// Middleware: for every incoming request, first check if it matches
// a real file sitting in the current folder ('.' means "this
// project's root"). If it does, send that file back automatically —
// this is what lets your browser actually load dashboard.html,
// styles.css, transactions.js, etc. without you writing a route
// for each one individually.


// Middleware: enables your server to understand plain-text request
// bodies. Without this, when your front end sends CSV text via
// fetch, request.body inside your routes below would come back
// empty/undefined — this is what makes request.body actually work.

// Defines a GET route at the address /api/transactions.
// GET = a request just asking for data, not sending anything.
// Note: '/api/transactions' is just a made-up label — it has no
// relation to any real file path, it's simply the string your
// front end's fetch() call has to match to trigger this function.


app.get('/api/categories', async function(request,response){
	const fileContents = await fs.promises.readFile('data/categories.csv','utf8');
	response.send(fileContents);
});

app.post('/api/categories', async function(request,response){
	await fs.promises.writeFile('data/categories.csv',request.body);
	response.send('Saved');
});

app.get('/api/statements', async function(request,response){
	const fileContents = await fs.promises.readFile('data/statements.csv','utf8');
	response.send(fileContents);
})
app.post('/api/statements', async function(request,response){
	await fs.promises.writeFile('data/statements.csv',request.body);
	response.send('saved');
});



// Starts the server and tells it to sit and listen for incoming
// requests on port 3000. This is the line that keeps the process
// alive and running (instead of finishing and exiting), and prints
// a confirmation message to your terminal once it's up.
app.listen(3000, function() {
	console.log('Server running on http://localhost:3000');
});
//loadTransactions();