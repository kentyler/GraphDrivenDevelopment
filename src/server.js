const express = require('express');
const db = require('./db');
const render = require('./render');

const app = express();
app.use(express.json());

const port = process.env.PORT || 3000;

// Nodes
app.post('/nodes', async (req, res) => {
    try {
        const { node, sessionId } = req.body;
        const newNode = await db.createIntent(node, sessionId);
        res.status(201).json(newNode);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

app.get('/nodes/incomplete', async (req, res) => {
    try {
        const incomplete = await db.queryIncomplete();
        res.json(incomplete);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/nodes/:id/projection', async (req, res) => {
    try {
        const projection = await db.buildProjection(req.params.id);
        if (!projection) return res.status(404).json({ error: 'Node not found' });

        if (req.query.format === 'human') {
            res.send(render.renderHuman(projection));
        } else {
            res.json(projection);
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Edges
app.post('/edges', async (req, res) => {
    try {
        const { from_node, to_node, edge_type, session_id } = req.body;
        const edge = await db.createEdge(from_node, to_node, edge_type, session_id);
        res.status(201).json(edge);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// Sessions
app.post('/sessions', async (req, res) => {
    try {
        const { intent_id, actor_type, actor_id } = req.body;
        const session = await db.createSession(intent_id, actor_type, actor_id);
        res.status(201).json(session);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

app.post('/sessions/:id/close', async (req, res) => {
    try {
        const session = await db.closeSession(req.params.id);
        res.json(session);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// Expressions
app.post('/expressions', async (req, res) => {
    try {
        const { intent_id, session_id, artifacts, summary } = req.body;
        const expression = await db.recordExpression(intent_id, session_id, artifacts, summary);
        res.status(201).json(expression);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// Agents
app.post('/agents', async (req, res) => {
    try {
        const agent = await db.defineAgent(req.body);
        res.status(201).json(agent);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

app.get('/agents', async (req, res) => {
    try {
        const agents = await db.queryAgents(req.query);
        res.json(agents);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/agents/:id/activate', async (req, res) => {
    try {
        const agent = await db.activateAgent(req.params.id);
        res.json(agent);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// Dashboard helper
app.get('/dashboard', async (req, res) => {
    try {
        const incomplete = await db.queryIncomplete();
        const agents = await db.queryAgents();

        const summary = {
            red_intents: incomplete,
            agents: agents,
            gap_count: incomplete.filter(n => n.type === 'gap').length
        };

        if (req.query.format === 'human') {
            let output = "## GDD Dashboard\n\n### Red Intents\n";
            incomplete.forEach(n => {
                output += `- ${n.name} (${n.id}) - Dependents: ${n.dependent_count}\n`;
            });
            output += `\n### Active Agents\n`;
            agents.forEach(a => {
                output += `- ${a.name} (${a.status})\n`;
            });
            res.send(output);
        } else {
            res.json(summary);
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.listen(port, () => {
    console.log(`GDD Server listening on port ${port}`);
});
