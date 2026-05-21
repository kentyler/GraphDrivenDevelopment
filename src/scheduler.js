const { broadcastRedNodes } = require('./operations/broadcastRedNodes');
const { receivePeerMessages } = require('./operations/receivePeerMessages');

function startScheduler() {
  const intervalHours = parseFloat(process.env.GDD_BROADCAST_INTERVAL_HOURS);
  const repeatHours = parseFloat(process.env.GDD_BROADCAST_REPEAT_HOURS) || undefined;

  if (!intervalHours) return null;

  const intervalMs = intervalHours * 60 * 60 * 1000;

  async function run() {
    const ts = new Date().toISOString();
    try {
      const broadcastResult = await broadcastRedNodes({ repeat_hours: repeatHours });
      console.log(`[${ts}] Broadcast: ${JSON.stringify(broadcastResult)}`);
    } catch (err) {
      console.error(`[${ts}] Broadcast error: ${err.message}`);
    }
    try {
      const receiveResult = await receivePeerMessages();
      console.log(`[${ts}] Receive: ${JSON.stringify(receiveResult)}`);
    } catch (err) {
      console.error(`[${ts}] Receive error: ${err.message}`);
    }
  }

  run();
  const id = setInterval(run, intervalMs);

  console.log(`Peer broadcast scheduler started (every ${intervalHours}h, repeat window ${repeatHours || 'none'}h)`);

  return id;
}

module.exports = { startScheduler };
