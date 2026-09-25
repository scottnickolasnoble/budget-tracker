require('dotenv').config();
const { Pool, types } = require('pg');

types.setTypeParser(1082, function(value){
	return value;
})

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

module.exports = pool;