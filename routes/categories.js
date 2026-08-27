const express = require('express');
const router = express.Router();
const fs = require('fs');

router.get('/', async function(request, response){
	const fileContents = await fs.promises.readFile('data/categories.csv', 'utf8');
	response.send(fileContents);
});
router.post('/', async function(request, response){
	await fs.promises.writeFile('data/categories.csv', request.body);
	response.send('Saved');
});

module.exports = router;