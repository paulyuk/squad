# Squad Observer 🔭

Real-time observability for Squad AI agents. Watch your team work with live logs, traces, and an optional Aspire Dashboard integration.

## The Problem

When Squad spawns background agents via the `task` tool, you can't see what they're doing until they finish. This makes debugging difficult and removes visibility into multi-agent workflows.

## The Solution

Squad Observer watches your `.squad/` directory for file changes and:
1. **Streams agent output** to your terminal in real-time
2. **Emits OpenTelemetry traces** to Aspire Dashboard (or any OTLP endpoint)
3. **Tracks agent activity** across sessions

## Quick Start

```bash
# Install
cd packages/squad-observer
npm install

# Run (watches current directory's .squad folder)
node src/cli.js

# Or with npx from the repo root
npx squad-observer
```

## Usage

```bash
# Basic usage - watch .squad/ in current directory
squad-observer

# Watch a specific directory
squad-observer --dir ./my-project/.squad

# Enable verbose logging
squad-observer --verbose

# Send telemetry to Aspire Dashboard
squad-observer --endpoint http://localhost:18889/v1/traces

# Console only (no OTEL)
squad-observer --endpoint ""
```

## With Aspire Dashboard

[.NET Aspire Dashboard](https://learn.microsoft.com/en-us/dotnet/aspire/fundamentals/dashboard/overview) provides a beautiful UI for viewing traces and logs.

### Install Aspire Dashboard

```bash
# Install as a .NET global tool
dotnet tool install -g aspire-dashboard

# Or run via Docker
docker run -p 18888:18888 -p 18889:18889 mcr.microsoft.com/dotnet/aspire-dashboard
```

### Run Together

```bash
# Terminal 1: Start Aspire Dashboard
aspire-dashboard

# Terminal 2: Start Squad Observer
squad-observer --endpoint http://localhost:18889/v1/traces
```

Then open http://localhost:18888 to see:
- **Traces**: Each agent action as a span
- **Logs**: Real-time agent output
- **Services**: One "service" per agent type

## What Gets Observed

| File Pattern | Event Type | Description |
|-------------|------------|-------------|
| `.squad/agents/*/history.md` | `agent-learning` | Agent memories and learnings |
| `.squad/decisions/inbox/*.md` | `decision-proposed` | Pending team decisions |
| `.squad/decisions.md` | `decision-merged` | Finalized decisions |
| `.squad/log/*.md` | `session-log` | Session activity logs |
| `.squad/orchestration-log/*.md` | `orchestration-event` | Routing and coordination |

## Console Output

```
12:30:45 [architect]     agent-learning       Learned pattern for API error handling...
12:30:52 [engineer]      decision-proposed    Proposing: Use TypeScript strict mode...
12:31:01 [squad]         session-log          Completed 3 tasks, 2 agents active...
```

## Programmatic Usage

```javascript
import { SquadObserver } from 'squad-observer';

const observer = new SquadObserver({
  squadDir: '.squad',
  otelEndpoint: 'http://localhost:18889/v1/traces',
  verbose: true,
});

observer.on('event', (event) => {
  console.log(`${event.agentName}: ${event.type}`);
});

await observer.start();
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                   .squad/ Directory                             │
│  ├── agents/{name}/history.md    (agent memories)               │
│  ├── decisions/inbox/*.md        (pending decisions)            │
│  └── log/*.md                    (session logs)                 │
└─────────────────────────────────────────────────────────────────┘
                                       │ watch (chokidar)
                                       ▼
┌─────────────────────────────────────────────────────────────────┐
│             Squad Observer                                      │
│  FileWatcher ──▶ MarkdownParser ──▶ TelemetryEmitter            │
└─────────────────────────────────────────────────────────────────┘
                     │                           │
                     ▼                           ▼
              Console Output              OTLP → Aspire Dashboard
```

## Limitations

**What you CAN see:**
- File-based agent output (history, decisions, logs)
- Orchestration events (which agent was routed, why)
- Session summaries and decision trails

**What you CANNOT see:**
- Real-time agent reasoning (LLM internals are opaque)
- Agent-to-agent messages (happen inside VS Code Copilot)
- Prompt/response pairs (not exposed by Copilot)

## License

MIT
