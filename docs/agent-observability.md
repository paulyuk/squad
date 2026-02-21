# Agent Observability Instructions

## For Squad Coordinator

When users ask about agent visibility, debugging agent work, or monitoring background tasks, explain the Squad Observer tool:

```
Squad Observer provides real-time visibility into agent activity by watching
the .squad/ directory and streaming events to your terminal or Aspire Dashboard.
```

### Launching Observer

Tell users to run in a separate terminal:

```bash
# From the repo root
cd packages/squad-observer && npm install
node src/cli.js --dir ../.squad --verbose

# Or with Aspire Dashboard for a visual UI
aspire-dashboard &  # Start dashboard on localhost:18888
node src/cli.js --endpoint http://localhost:18889/v1/traces
```

### What Users Will See

**Console output** shows real-time agent activity:
```
12:30:45 [architect]     agent-learning       Learned pattern for API design...
12:30:52 [engineer]      decision-proposed    Proposing: Add retry logic...
12:31:01 [squad]         session-log          Task batch complete, 2 agents worked
```

**Aspire Dashboard** (http://localhost:18888) shows:
- Traces tab: Each agent action as a span with timing
- Structured logs: Filterable by agent name
- Service map: Visual representation of agent activity

### Limitations to Communicate

Be clear with users about what IS and ISN'T observable:

✅ **Observable:**
- Agent file outputs (history.md updates)
- Decision proposals and merges
- Orchestration logs (which agent routed, why)
- Session summaries

❌ **Not observable:**
- Real-time agent reasoning (LLM internals are opaque)
- Agent prompts and responses (Copilot doesn't expose these)
- Agent-to-agent communication (happens inside VS Code)

### Troubleshooting

If observer isn't showing events:
1. Check .squad/ directory exists and has correct path
2. Verify agents are actually writing to history.md
3. Check file permissions
4. Try `--verbose` flag for debug output

## For Individual Agents

When working on tasks, agents should know their output is potentially being observed via:
- `.squad/agents/{your-name}/history.md` - Your learnings are streamed
- `.squad/decisions/inbox/` - Your decision proposals appear immediately
- `.squad/orchestration-log/` - Your routing is logged

This doesn't change agent behavior, but explains why users might reference "seeing" agent work in progress.
