/**
 * Squad Observer - Main coordinator class
 * 
 * Combines file watching, markdown parsing, and telemetry emission
 * into a single cohesive service.
 */

import { FileWatcher } from './watcher.js';
import { MarkdownParser } from './parser.js';
import { TelemetryEmitter } from './telemetry.js';
import { EventEmitter } from 'events';
import path from 'path';

export class SquadObserver extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      squadDir: options.squadDir || '.squad',
      otelEndpoint: options.otelEndpoint || process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
      serviceName: options.serviceName || 'squad-agents',
      verbose: options.verbose ?? false,
      consoleOutput: options.consoleOutput ?? true,
      ...options
    };

    this.watcher = null;
    this.parser = new MarkdownParser();
    this.telemetry = null;
    this.running = false;
    this.stats = {
      filesWatched: 0,
      eventsEmitted: 0,
      agentsSeen: new Set(),
    };
  }

  /**
   * Start the observer service
   */
  async start() {
    if (this.running) {
      throw new Error('Observer is already running');
    }

    // Initialize telemetry if endpoint configured
    if (this.options.otelEndpoint) {
      this.telemetry = new TelemetryEmitter({
        endpoint: this.options.otelEndpoint,
        serviceName: this.options.serviceName,
      });
      await this.telemetry.start();
      this._log('info', `Telemetry connected to ${this.options.otelEndpoint}`);
    } else {
      this._log('warn', 'No OTEL endpoint configured, running in console-only mode');
    }

    // Initialize file watcher
    this.watcher = new FileWatcher(this.options.squadDir, {
      ignoreInitial: true,
      debounceMs: 100,
    });

    this.watcher.on('file', (fileEvent) => this._handleFileEvent(fileEvent));
    this.watcher.on('error', (error) => this._handleError(error));
    this.watcher.on('ready', () => {
      this._log('info', `Watching ${this.options.squadDir}/ for agent activity...`);
      this.emit('ready');
    });

    this.watcher.start();
    this.running = true;

    return this;
  }

  /**
   * Stop the observer service
   */
  async stop() {
    if (!this.running) return;

    if (this.watcher) {
      await this.watcher.stop();
      this.watcher = null;
    }

    if (this.telemetry) {
      await this.telemetry.stop();
      this.telemetry = null;
    }

    this.running = false;
    this._log('info', 'Observer stopped');
    this.emit('stopped');
  }

  /**
   * Handle a file change event
   */
  async _handleFileEvent(fileEvent) {
    this.stats.filesWatched++;
    
    try {
      // Parse the file for structured events
      const events = await this.parser.parseIncremental(fileEvent.path);
      
      if (!events || events.length === 0) {
        return; // No new content to process
      }

      // Track agent
      if (fileEvent.agentName) {
        this.stats.agentsSeen.add(fileEvent.agentName);
      }

      // Process each event
      for (const event of events) {
        // Merge file metadata into event
        const enrichedEvent = {
          ...event,
          agentName: event.agentName || fileEvent.agentName,
          category: fileEvent.category,
          fileType: fileEvent.fileType,
          filename: fileEvent.filename,
        };

        // Emit to console if enabled
        if (this.options.consoleOutput) {
          this._logEvent(enrichedEvent);
        }

        // Emit to OTel if configured
        if (this.telemetry) {
          this.telemetry.emitAgentEvent(enrichedEvent);
        }

        // Emit to any listeners
        this.stats.eventsEmitted++;
        this.emit('event', enrichedEvent);
      }

    } catch (error) {
      this._handleError(error);
    }
  }

  /**
   * Handle errors
   */
  _handleError(error) {
    this._log('error', `Error: ${error.message}`);
    this.emit('error', error);
  }

  /**
   * Log an agent event to console with formatting
   */
  _logEvent(event) {
    const timestamp = new Date(event.timestamp).toLocaleTimeString();
    const agent = event.agentName ? `[${event.agentName}]` : '[squad]';
    const type = event.type.padEnd(20);
    
    // Color coding based on event type
    const colors = {
      'agent-learning': '\x1b[36m',    // Cyan
      'agent-output': '\x1b[32m',       // Green
      'decision-proposed': '\x1b[33m',  // Yellow
      'decision-merged': '\x1b[35m',    // Magenta
      'session-log': '\x1b[34m',        // Blue
      'orchestration-event': '\x1b[37m', // White
    };
    const reset = '\x1b[0m';
    const color = colors[event.type] || '';

    // Truncate content for display
    const preview = (event.content || '')
      .replace(/\n/g, ' ')
      .substring(0, 80);
    const suffix = event.content?.length > 80 ? '...' : '';

    console.log(`${color}${timestamp} ${agent.padEnd(15)} ${type} ${preview}${suffix}${reset}`);
  }

  /**
   * Internal logging
   */
  _log(level, message) {
    if (this.options.verbose || level === 'error' || level === 'warn') {
      const prefix = level === 'error' ? '\x1b[31m[ERROR]\x1b[0m' :
                     level === 'warn' ? '\x1b[33m[WARN]\x1b[0m' :
                     '\x1b[34m[INFO]\x1b[0m';
      console.log(`${prefix} ${message}`);
    }
  }

  /**
   * Get current statistics
   */
  getStats() {
    return {
      ...this.stats,
      agentsSeen: Array.from(this.stats.agentsSeen),
      running: this.running,
    };
  }
}
