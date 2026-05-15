const fs = require('fs');
const path = require('path');
const { pool } = require('../db');

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const schemaDir = __dirname;
    const sqlFiles = ['005-edge-boards-enums.sql', '006-edge-boards-tables.sql'];

    for (const file of sqlFiles) {
      const sql = fs.readFileSync(path.join(schemaDir, file), 'utf8');
      console.log(`Running ${file}...`);
      await client.query(sql);
      console.log(`  Done.`);
    }

    // Create default board
    console.log('Creating default board...');
    await client.query(`
      INSERT INTO gdd.boards (id, created_by, statement, edge_statement)
      VALUES ('default-board', 'system', 'The original GDD intent graph', 'Single-instance, single-board operation')
      ON CONFLICT (id) DO NOTHING
    `);

    // Backfill existing nodes with default board
    console.log('Backfilling nodes with default board_id...');
    const updated = await client.query(`
      UPDATE gdd.nodes SET board_id = 'default-board' WHERE board_id IS NULL
    `);
    console.log(`  Updated ${updated.rowCount} nodes.`);

    await client.query('COMMIT');

    // Verify
    console.log('\nVerifying migration...');

    const enums = await client.query(`
      SELECT typname FROM pg_type
      WHERE typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'gdd')
      AND typtype = 'e'
      ORDER BY typname
    `);
    console.log(`  Enums: ${enums.rows.map(r => r.typname).join(', ')}`);

    const tables = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'gdd'
      ORDER BY table_name
    `);
    console.log(`  Tables: ${tables.rows.map(r => r.table_name).join(', ')}`);

    const board = await client.query(`SELECT id, statement FROM gdd.boards WHERE id = 'default-board'`);
    console.log(`  Default board: ${board.rows[0]?.statement || 'MISSING'}`);

    const nodesWithBoard = await client.query(`SELECT COUNT(*) FROM gdd.nodes WHERE board_id IS NOT NULL`);
    console.log(`  Nodes with board_id: ${nodesWithBoard.rows[0].count}`);

    console.log('\nMigration complete.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
