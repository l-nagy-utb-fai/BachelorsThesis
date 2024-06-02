const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'photos',
  password: 'testovanikryptologie',
  port: 5432,
});

module.exports = pool;
