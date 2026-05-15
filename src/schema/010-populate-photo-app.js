const { pool } = require('../db');

const nodes = [
  // Root compose
  { id: 'photo-app', type: 'compose', name: 'Photo App', description: 'Family photo management: scan, catalog, triage, browse, and preserve.' },

  // Schema (already built)
  { id: 'photo-schema', type: 'compose', name: 'Photo catalog schema', description: 'PostgreSQL tables for files, faces, persons, tags.' },
  { id: 'photo-table-files', type: 'define-table', name: 'Files table', description: 'catalog.files — scanned photos with EXIF, hash, paths.', test_condition: 'Table catalog.files exists with columns for path, hash, EXIF fields, caption, rating.' },
  { id: 'photo-table-faces', type: 'define-table', name: 'Faces table', description: 'catalog.faces — detected face regions per file.', test_condition: 'Table catalog.faces exists linking face regions to files.' },
  { id: 'photo-table-persons', type: 'define-table', name: 'Persons table', description: 'catalog.persons — named identities from face clustering.', test_condition: 'Table catalog.persons exists with name field.' },
  { id: 'photo-table-tags', type: 'define-table', name: 'Tags and file_tags tables', description: 'catalog.tags + catalog.file_tags — tagging system.', test_condition: 'Tables exist with unique constraint on (name, category).' },

  // Scan pipeline (already built)
  { id: 'photo-scan', type: 'compose', name: 'Photo scanning pipeline', description: 'Walk directories, extract EXIF, hash files, insert records.' },
  { id: 'photo-op-walk', type: 'implement-operation', name: 'Walk directory tree', description: 'Recursively find image files.', test_condition: 'Given a folder path, returns list of image files with extensions.' },
  { id: 'photo-op-exif', type: 'implement-operation', name: 'Extract EXIF metadata', description: 'Pull date, camera, dimensions from image files.', test_condition: 'Returns taken_at, camera_make, camera_model, width, height from a JPEG with EXIF.' },
  { id: 'photo-op-hash', type: 'implement-operation', name: 'Compute file hash', description: 'SHA-256 hash for dedup.', test_condition: 'Same file always produces same hash. Different files produce different hashes.' },
  { id: 'photo-op-insert', type: 'implement-operation', name: 'Insert file record', description: 'Insert into catalog.files with all metadata.', test_condition: 'File record created with path, hash, EXIF fields. Duplicate hash rejected.' },
  { id: 'photo-op-orchestrate', type: 'implement-operation', name: 'Scan orchestrator', description: 'Walk + EXIF + hash + insert in pipeline.', test_condition: 'Point at a folder, all photos scanned and inserted.' },

  // Face operations (already built)
  { id: 'photo-face-detect', type: 'implement-operation', name: 'Face detection', description: 'Detect face regions in photos.', test_condition: 'Given a photo with faces, returns bounding box regions.' },
  { id: 'photo-face-cluster', type: 'implement-operation', name: 'Face clustering', description: 'Group detected faces by similarity into persons.', test_condition: 'Photos of same person cluster together. Different people in separate clusters.' },

  // Triage UI (already built)
  { id: 'photo-triage-ui', type: 'compose', name: 'Photo triage interface', description: 'Web UI for reviewing, rating, captioning, and tagging photos.' },
  { id: 'photo-ui-grid', type: 'implement-operation', name: 'Photo grid view', description: 'Grid of thumbnails per folder with lazy loading.', test_condition: 'Select folder, see photo grid. Thumbnails load lazily.' },
  { id: 'photo-ui-detail', type: 'implement-operation', name: 'Photo detail modal', description: 'Click photo to see larger view with metadata.', test_condition: 'Clicking thumbnail opens modal with larger image and filename.' },
  { id: 'photo-ui-rating', type: 'implement-operation', name: 'Rating system', description: 'Keep/duplicate/skip rating per photo.', test_condition: 'Can set and clear rating. Rating persists. Badge visible in grid.' },
  { id: 'photo-ui-caption', type: 'implement-operation', name: 'Caption editing', description: 'Add/edit caption text per photo.', test_condition: 'Can type caption and save. Caption persists across reload.' },
  { id: 'photo-ui-tags', type: 'implement-operation', name: 'Tag management', description: 'Add/remove tags per photo. Tag autocomplete.', test_condition: 'Can add tags, remove tags. Tags filterable in grid.' },
  { id: 'photo-ui-filters', type: 'implement-operation', name: 'Grid filters', description: 'Filter by folder, rating, tag.', test_condition: 'Rating filter shows only matching. Tag filter shows only tagged photos.' },

  // Browse UI (the new work)
  { id: 'photo-browse-ui', type: 'compose', name: 'Photo browse interface', description: 'Richer browsing beyond triage: timeline, lightbox, search, people.' },
  { id: 'photo-ui-lightbox', type: 'implement-operation', name: 'Lightbox viewer', description: 'Full-screen photo viewing with prev/next navigation.', test_condition: 'Full-screen overlay. Arrow keys or buttons navigate between photos. Escape closes.' },
  { id: 'photo-ui-timeline', type: 'implement-operation', name: 'Timeline view', description: 'Photos grouped by date with year/month headers.', test_condition: 'Photos display chronologically. Year and month section headers visible. Scroll to any period.' },
  { id: 'photo-ui-search', type: 'implement-operation', name: 'Search', description: 'Search by filename, caption, date range.', test_condition: 'Text search matches filename and caption. Date range filter works.' },
  { id: 'photo-ui-people', type: 'implement-operation', name: 'People browser', description: 'Browse by detected person across all folders.', test_condition: 'Shows list of persons with face thumbnails. Click person to see all their photos.' },
  { id: 'photo-ui-all-folders', type: 'implement-operation', name: 'Cross-folder browsing', description: 'View all photos across folders, not one folder at a time.', test_condition: 'Can browse all photos without selecting a specific folder. Folder shown as metadata.' },
];

const edges = [
  // photo-app contains
  { from: 'photo-app', to: 'photo-schema', type: 'contains' },
  { from: 'photo-app', to: 'photo-scan', type: 'contains' },
  { from: 'photo-app', to: 'photo-triage-ui', type: 'contains' },
  { from: 'photo-app', to: 'photo-browse-ui', type: 'contains' },

  // schema contains
  { from: 'photo-schema', to: 'photo-table-files', type: 'contains' },
  { from: 'photo-schema', to: 'photo-table-faces', type: 'contains' },
  { from: 'photo-schema', to: 'photo-table-persons', type: 'contains' },
  { from: 'photo-schema', to: 'photo-table-tags', type: 'contains' },

  // scan contains + blocked-by
  { from: 'photo-scan', to: 'photo-op-walk', type: 'contains' },
  { from: 'photo-scan', to: 'photo-op-exif', type: 'contains' },
  { from: 'photo-scan', to: 'photo-op-hash', type: 'contains' },
  { from: 'photo-scan', to: 'photo-op-insert', type: 'contains' },
  { from: 'photo-scan', to: 'photo-op-orchestrate', type: 'contains' },
  { from: 'photo-scan', to: 'photo-face-detect', type: 'contains' },
  { from: 'photo-scan', to: 'photo-face-cluster', type: 'contains' },
  { from: 'photo-op-insert', to: 'photo-table-files', type: 'blocked-by' },
  { from: 'photo-op-orchestrate', to: 'photo-op-walk', type: 'blocked-by' },
  { from: 'photo-op-orchestrate', to: 'photo-op-exif', type: 'blocked-by' },
  { from: 'photo-op-orchestrate', to: 'photo-op-hash', type: 'blocked-by' },
  { from: 'photo-op-orchestrate', to: 'photo-op-insert', type: 'blocked-by' },
  { from: 'photo-face-detect', to: 'photo-table-faces', type: 'blocked-by' },
  { from: 'photo-face-cluster', to: 'photo-face-detect', type: 'blocked-by' },
  { from: 'photo-face-cluster', to: 'photo-table-persons', type: 'blocked-by' },

  // triage UI contains + blocked-by
  { from: 'photo-triage-ui', to: 'photo-ui-grid', type: 'contains' },
  { from: 'photo-triage-ui', to: 'photo-ui-detail', type: 'contains' },
  { from: 'photo-triage-ui', to: 'photo-ui-rating', type: 'contains' },
  { from: 'photo-triage-ui', to: 'photo-ui-caption', type: 'contains' },
  { from: 'photo-triage-ui', to: 'photo-ui-tags', type: 'contains' },
  { from: 'photo-triage-ui', to: 'photo-ui-filters', type: 'contains' },
  { from: 'photo-ui-grid', to: 'photo-table-files', type: 'blocked-by' },
  { from: 'photo-ui-detail', to: 'photo-ui-grid', type: 'blocked-by' },
  { from: 'photo-ui-rating', to: 'photo-ui-detail', type: 'blocked-by' },
  { from: 'photo-ui-caption', to: 'photo-ui-detail', type: 'blocked-by' },
  { from: 'photo-ui-tags', to: 'photo-table-tags', type: 'blocked-by' },
  { from: 'photo-ui-tags', to: 'photo-ui-detail', type: 'blocked-by' },
  { from: 'photo-ui-filters', to: 'photo-ui-grid', type: 'blocked-by' },

  // browse UI contains + blocked-by
  { from: 'photo-browse-ui', to: 'photo-ui-lightbox', type: 'contains' },
  { from: 'photo-browse-ui', to: 'photo-ui-timeline', type: 'contains' },
  { from: 'photo-browse-ui', to: 'photo-ui-search', type: 'contains' },
  { from: 'photo-browse-ui', to: 'photo-ui-people', type: 'contains' },
  { from: 'photo-browse-ui', to: 'photo-ui-all-folders', type: 'contains' },
  { from: 'photo-ui-lightbox', to: 'photo-ui-detail', type: 'blocked-by' },
  { from: 'photo-ui-timeline', to: 'photo-table-files', type: 'blocked-by' },
  { from: 'photo-ui-search', to: 'photo-table-files', type: 'blocked-by' },
  { from: 'photo-ui-people', to: 'photo-face-cluster', type: 'blocked-by' },
  { from: 'photo-ui-all-folders', to: 'photo-ui-grid', type: 'blocked-by' },
];

// Intents that are already satisfied (code exists)
const builtIds = [
  'photo-table-files', 'photo-table-faces', 'photo-table-persons', 'photo-table-tags',
  'photo-op-walk', 'photo-op-exif', 'photo-op-hash', 'photo-op-insert', 'photo-op-orchestrate',
  'photo-face-detect', 'photo-face-cluster',
  'photo-ui-grid', 'photo-ui-detail', 'photo-ui-rating', 'photo-ui-caption', 'photo-ui-tags', 'photo-ui-filters'
];

async function populate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Insert nodes
    let inserted = 0;
    for (const node of nodes) {
      const res = await client.query(
        `INSERT INTO gdd.nodes (id, type, name, description, test_condition, board_id)
         VALUES ($1, $2, $3, $4, $5, 'default-board')
         ON CONFLICT (id) DO NOTHING RETURNING id`,
        [node.id, node.type, node.name, node.description, node.test_condition || null]
      );
      if (res.rows.length > 0) inserted++;
    }
    console.log(`Inserted ${inserted} new nodes.`);

    // Insert edges
    let edgeCount = 0;
    for (const edge of edges) {
      const existing = await client.query(
        'SELECT 1 FROM gdd.edges WHERE from_node = $1 AND to_node = $2 AND edge_type = $3',
        [edge.from, edge.to, edge.type]
      );
      if (existing.rows.length === 0) {
        await client.query(
          'INSERT INTO gdd.edges (from_node, to_node, edge_type) VALUES ($1, $2, $3)',
          [edge.from, edge.to, edge.type]
        );
        edgeCount++;
      }
    }
    console.log(`Inserted ${edgeCount} new edges.`);

    // Add all nodes to team-photo-app graph
    let memberships = 0;
    for (const node of nodes) {
      const res = await client.query(
        'INSERT INTO gdd.graph_memberships (graph_id, node_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING node_id',
        ['team-photo-app', node.id]
      );
      if (res.rows.length > 0) memberships++;
    }
    console.log(`Added ${memberships} nodes to team-photo-app graph.`);

    // Record expression for already-built intents
    const exprId = `expr-photo-app-built-${Date.now()}`;
    await client.query(
      `INSERT INTO gdd.nodes (id, type, name, description, artifacts, board_id)
       VALUES ($1, 'expression', $2, $3, $4, 'default-board')`,
      [exprId, 'Photo app initial build',
       'Schema, scan pipeline, face detection/clustering, triage UI — all built and operational.',
       JSON.stringify({ codebase: 'D:/photo-app', files: ['server.js','scan-orchestrator.js','face-detect-hybrid.js','face-cluster.js','index.html'] })]
    );
    for (const id of builtIds) {
      await client.query(
        "INSERT INTO gdd.edges (from_node, to_node, edge_type) VALUES ($1, $2, 'satisfies')",
        [exprId, id]
      );
    }
    await client.query(
      'INSERT INTO gdd.graph_memberships (graph_id, node_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      ['team-photo-app', exprId]
    );
    console.log(`Satisfied ${builtIds.length} intents.`);

    await client.query('COMMIT');

    // Show what's red
    const red = await client.query(`
      SELECT n.id, n.name FROM gdd.nodes n
      JOIN gdd.graph_memberships gm ON gm.node_id = n.id
      WHERE gm.graph_id = 'team-photo-app'
        AND n.type NOT IN ('compose','expression','decision','signal')
        AND NOT EXISTS (SELECT 1 FROM gdd.edges e WHERE e.to_node = n.id AND e.edge_type = 'satisfies')
        AND NOT EXISTS (SELECT 1 FROM gdd.edges e WHERE e.to_node = n.id AND e.edge_type = 'supersedes')
      ORDER BY n.id
    `);
    console.log(`\nRed intents (${red.rows.length}):`);
    red.rows.forEach(r => console.log(`  ${r.id}: ${r.name}`));

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

populate();
