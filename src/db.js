const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.GDD_DB_HOST || 'localhost',
  port: parseInt(process.env.GDD_DB_PORT || '5432'),
  database: process.env.GDD_DB_NAME || 'gdd',
  user: process.env.GDD_DB_USER || 'postgres',
  password: process.env.GDD_DB_PASSWORD,
});

module.exports = { pool };
