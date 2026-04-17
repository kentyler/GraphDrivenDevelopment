function renderHuman(projection) {
    if (!projection) return "No projection data.";

    const { vantage, upstream, downstream } = projection;

    let output = `## Intent: ${vantage.name} (${vantage.id})\n\n`;
    output += `**Description:** ${vantage.description || 'No description provided.'}\n`;
    output += `**Status:** ${vantage.status.toUpperCase()}\n`;
    output += `**Test Condition:** ${vantage.test_condition || 'Structural/None'}\n\n`;

    if (upstream && upstream.length > 0) {
        output += `### Blocks this intent (Upstream):\n`;
        upstream.forEach(n => {
            output += `- [${n.status === 'satisfied' ? 'x' : ' '}] ${n.name} (${n.id})\n`;
        });
        output += `\n`;
    }

    if (downstream && downstream.length > 0) {
        output += `### Blocked by this intent (Downstream):\n`;
        downstream.forEach(n => {
            output += `- [${n.status === 'satisfied' ? 'x' : ' '}] ${n.name} (${n.id})\n`;
        });
        output += `\n`;
    }

    if (vantage.expression_summary) {
        output += `### Expression Summary:\n${vantage.expression_summary}\n\n`;
    }

    return output;
}

function renderLLM(projection) {
    return JSON.stringify(projection, null, 2);
}

module.exports = {
    renderHuman,
    renderLLM
};
