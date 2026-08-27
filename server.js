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

// Middleware: for every incoming request, first check if it matches
// a real file sitting in the current folder ('.' means "this
// project's root"). If it does, send that file back automatically —
// this is what lets your browser actually load dashboard.html,
// styles.css, transactions.js, etc. without you writing a route
// for each one individually.
app.use(express.static('.'));

// Middleware: enables your server to understand plain-text request
// bodies. Without this, when your front end sends CSV text via
// fetch, request.body inside your routes below would come back
// empty/undefined — this is what makes request.body actually work.
app.use(express.text());

// Defines a GET route at the address /api/transactions.
// GET = a request just asking for data, not sending anything.
// Note: '/api/transactions' is just a made-up label — it has no
// relation to any real file path, it's simply the string your
// front end's fetch() call has to match to trigger this function.
app.get('/api/transactions', async function(request, response){
	// Read the REAL file on disk. 'utf8' tells it to give back
	// readable text instead of raw binary data. await pauses just
	// this function until the read finishes, without freezing the
	// whole server for other requests in the meantime.
	const fileContents = await fs.promises.readFile('data/transactions.csv', 'utf8');

	// Send that file's text content back as the response body —
	// this is what your front end's loadTransactions() receives
	// when it does await response.text().
	response.send(fileContents);
})

// Defines a POST route at that same address, /api/transactions.
// POST = a request that's sending data to the server, not just
// asking for something. Express treats GET and POST on the same
// address as two completely separate rules.
app.post('/api/transactions', async function(request, response){
	// Take whatever text was sent in the request body (the CSV
	// string your front end's saveTransactions() built) and write
	// it to the real file on disk, completely overwriting whatever
	// was there before. Again, await pauses just this function
	// until the write finishes.
	await fs.promises.writeFile('data/transactions.csv', request.body);

	// Send a short confirmation back to the front end so it knows
	// the save actually succeeded.
	response.send('Saved');
})

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