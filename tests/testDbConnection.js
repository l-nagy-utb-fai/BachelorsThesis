const pool = require('../src/db');

async function testConnection() {
  try {
    const res = await pool.query('SELECT NOW()');
    console.log('Connection successful:', res.rows[0]);
  } catch (err) {
    console.error('Connection error:', err);
  } finally {
    pool.end();
  }
}

testConnection();
