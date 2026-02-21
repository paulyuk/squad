#!/usr/bin/env node

/**
 * Squad Observer CLI
 * 
 * Usage:
 *   squad-observer [options]
 * 
 * Options:
 *   --dir, -d       Path to .squad directory (default: .squad)
 *   --endpoint, -e  OTEL endpoint URL (default: http://localhost:18889/v1/traces)
 *   --verbose, -v   Enable verbose logging
 *   --no-console    Disable console output (only emit to OTEL)
 *   --help, -h      Show this help message
 */

import { SquadObserver } from './observer.js';
import path from 'path';
import fs from 'fs';

function parseArgs(args) {
  const options = {
    squadDir: '.squad',
    otelEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:18889/v1/traces',
    verbose: false,
    consoleOutput: true,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--help' || arg === '-h') {
      showHelp();
      process.exit(0);
    }
    
    if (arg === '--dir' || arg === '-d') {
      options.squadDir = args[++i];
    } else if (arg === '--endpoint' || arg === '-e') {
      options.otelEndpoint = args[++i];
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--no-console') {
      options.consoleOutput = false;
    }
  }

  return options;
}

function showHelp() {
  console.log(`
Squad Observer - Real-time agent observability

USAGE:
  squad-observer [options]

OPTIONS:
  --dir, -d <path>       Path to .squad directory (default: .squad)
  --endpoint, -e <url>   OTEL endpoint URL (default: http://localhost:18889/v1/traces)
  --verbose, -v          Enable verbose logging
  --no-console           Disable console output (only emit to OTEL)
  --help, -h             Show this help message

EXAMPLES:
  # Watch current directory's .squad folder
  squad-observer

  # Watch specific directory with verbose output
  squad-observer --dir ./my-project/.squad --verbose

  # Send telemetry to custom Aspire endpoint
  squad-observer --endpoint http://localhost:18889/v1/traces

ENVIRONMENT VARIABLES:
  OTEL_EXPORTER_OTLP_ENDPOINT   Default OTEL endpoint URL

For more information, see: https://github.com/paulyuk/squad
`);
}

function showBanner() {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║               🔭 Squad Observer v0.1.0                    ║
║          Real-time agent observability dashboard          ║
╚═══════════════════════════════════════════════════════════╝
`);
}

async function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  // Resolve squad directory
  options.squadDir = path.resolve(process.cwd(), options.squadDir);

  // Check if .squad directory exists
  if (!fs.existsSync(options.squadDir)) {
    console.error(`\x1b[31m[ERROR]\x1b[0m Squad directory not found: ${options.squadDir}`);
    console.error('Make sure you are in a directory with a .squad folder, or use --dir to specify the path.');
    process.exit(1);
  }

  showBanner();
  
  console.log(`📁 Watching: ${options.squadDir}`);
  if (options.otelEndpoint) {
    console.log(`📡 Telemetry: ${options.otelEndpoint}`);
  } else {
    console.log('📡 Telemetry: disabled (console only)');
  }
  console.log('');

  const observer = new SquadObserver(options);

  // Handle graceful shutdown
  const shutdown = async () => {
    console.log('\n\nShutting down...');
    const stats = observer.getStats();
    console.log(`\nSession stats:`);
    console.log(`  Files watched: ${stats.filesWatched}`);
    console.log(`  Events emitted: ${stats.eventsEmitted}`);
    console.log(`  Agents seen: ${stats.agentsSeen.join(', ') || 'none'}`);
    await observer.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Start observing
  try {
    await observer.start();
    console.log('Waiting for agent activity... (Ctrl+C to exit)\n');
  } catch (error) {
    console.error(`\x1b[31m[ERROR]\x1b[0m Failed to start observer: ${error.message}`);
    process.exit(1);
  }
}

main().catch(console.error);
