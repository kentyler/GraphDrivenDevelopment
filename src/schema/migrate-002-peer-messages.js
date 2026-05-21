const fs = require('fs');
const path = require('path');
const { pool } = require('../db');

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Run SQL migration
    const sql = fs.readFileSync(path.join(__dirname, '015-peer-messages.sql'), 'utf8');
    console.log('Running 015-peer-messages.sql...');
    await client.query(sql);
    console.log('  Done.');

    // Register peer-network agent
    console.log('Registering peer-network agent...');
    await client.query(`
      INSERT INTO gdd.agents (id, name, scope, trust_level, trigger, status)
      VALUES ('peer-network', 'Peer Network',
        '{"type":"p2p","description":"Sovereign GDD instances exchanging messages about red intents via email"}',
        'gaps-only', '{"type":"manual"}', 'defined')
      ON CONFLICT (id) DO NOTHING
    `);
    console.log('  Done.');

    await client.query('COMMIT');

    // Verify
    console.log('\nVerifying migration...');

    const enums = await client.query(`
      SELECT typname FROM pg_type
      WHERE typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'gdd')
      AND typtype = 'e'
      AND typname LIKE 'peer_message%'
      ORDER BY typname
    `);
    console.log(`  Peer enums: ${enums.rows.map(r => r.typname).join(', ')}`);

    const tables = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'gdd' AND table_name = 'peer_messages'
    `);
    console.log(`  Table exists: ${tables.rows.length > 0}`);

    const agent = await client.query(`SELECT id, name FROM gdd.agents WHERE id = 'peer-network'`);
    console.log(`  Agent: ${agent.rows[0]?.name || 'MISSING'}`);

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
