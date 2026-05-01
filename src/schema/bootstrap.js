const fs = require('fs');
const path = require('path');
const { pool } = require('../db');

async function bootstrap() {
  const client = await pool.connect();
  try {
    const schemaDir = __dirname;
    const sqlFiles = ['001-enums.sql', '002-tables.sql', '003-bootstrap.sql'];

    for (const file of sqlFiles) {
      const sql = fs.readFileSync(path.join(schemaDir, file), 'utf8');
      console.log(`Running ${file}...`);
      await client.query(sql);
      console.log(`  Done.`);
    }

    console.log('\nLayer 0 schema complete. Verifying...');

    // Verify enums
    const enums = await client.query(`
      SELECT typname FROM pg_type
      WHERE typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'gdd')
      AND typtype = 'e'
      ORDER BY typname
    `);
    console.log(`  Enums: ${enums.rows.map(r => r.typname).join(', ')}`);

    // Verify tables
    const tables = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'gdd'
      ORDER BY table_name
    `);
    console.log(`  Tables: ${tables.rows.map(r => r.table_name).join(', ')}`);

    // Verify root intent
    const root = await client.query(`SELECT id, name FROM gdd.nodes WHERE id = 'gdd-root'`);
    console.log(`  Root intent: ${root.rows[0]?.name || 'MISSING'}`);

    console.log('\nBootstrap complete.');
  } catch (err) {
    console.error('Bootstrap failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

bootstrap();
