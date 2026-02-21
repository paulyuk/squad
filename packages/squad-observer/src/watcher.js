/**
 * File Watcher - Monitors .squad/ directory for agent activity
 */

import chokidar from 'chokidar';
import { EventEmitter } from 'events';
import path from 'path';

export class FileWatcher extends EventEmitter {
  constructor(squadDir, options = {}) {
    super();
    this.squadDir = squadDir;
    this.options = {
      ignoreInitial: options.ignoreInitial ?? true,
      debounceMs: options.debounceMs ?? 100,
      ...options
    };
    this.watcher = null;
    this.debounceTimers = new Map();
  }

  /**
   * Start watching the .squad/ directory
   */
  start() {
    const watchPaths = [
      path.join(this.squadDir, 'agents', '**', '*.md'),
      path.join(this.squadDir, 'decisions', '**', '*.md'),
      path.join(this.squadDir, 'log', '**', '*.md'),
      path.join(this.squadDir, 'orchestration-log', '**', '*.md')
    ];

    this.watcher = chokidar.watch(watchPaths, {
      ignoreInitial: this.options.ignoreInitial,
      persistent: true,
      awaitWriteFinish: {
        stabilityThreshold: this.options.debounceMs,
        pollInterval: 50
      }
    });

    this.watcher
      .on('add', (filePath) => this._handleEvent('add', filePath))
      .on('change', (filePath) => this._handleEvent('change', filePath))
      .on('error', (error) => this.emit('error', error))
      .on('ready', () => this.emit('ready'));

    return this;
  }

  /**
   * Stop watching
   */
  async stop() {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
    this.debounceTimers.forEach(timer => clearTimeout(timer));
    this.debounceTimers.clear();
  }

  /**
   * Handle file events with debouncing
   */
  _handleEvent(eventType, filePath) {
    // Clear any pending debounce for this file
    if (this.debounceTimers.has(filePath)) {
      clearTimeout(this.debounceTimers.get(filePath));
    }

    // Debounce rapid writes
    const timer = setTimeout(() => {
      this.debounceTimers.delete(filePath);
      const fileInfo = this._parseFilePath(filePath);
      this.emit('file', {
        type: eventType,
        path: filePath,
        ...fileInfo
      });
    }, this.options.debounceMs);

    this.debounceTimers.set(filePath, timer);
  }

  /**
   * Extract metadata from file path
   */
  _parseFilePath(filePath) {
    const relativePath = path.relative(this.squadDir, filePath);
    const parts = relativePath.split(path.sep);
    
    // Determine file category and extract agent name if applicable
    const category = parts[0]; // 'agents', 'decisions', 'log', 'orchestration-log'
    let agentName = null;
    let fileType = null;

    if (category === 'agents' && parts.length >= 2) {
      agentName = parts[1];
      fileType = parts[2] || 'unknown';
    } else if (category === 'decisions') {
      fileType = parts[1] === 'inbox' ? 'decision-inbox' : 'decision';
      // Extract agent name (first word before hyphen) from filename
      const filename = path.basename(filePath, '.md');
      const firstHyphen = filename.indexOf('-');
      if (firstHyphen > 0) {
        agentName = filename.substring(0, firstHyphen);
      }
    } else if (category === 'log') {
      fileType = 'session-log';
    } else if (category === 'orchestration-log') {
      fileType = 'orchestration-log';
      // Extract agent from filename (e.g., "2024-01-15-architect.md")
      const filename = path.basename(filePath, '.md');
      const agentMatch = filename.match(/-([a-z-]+)$/);
      if (agentMatch) {
        agentName = agentMatch[1];
      }
    }

    return {
      category,
      agentName,
      fileType,
      filename: path.basename(filePath)
    };
  }
}
