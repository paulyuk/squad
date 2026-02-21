/**
 * Markdown Parser - Extracts structured events from .squad/ markdown files
 */

import fs from 'fs/promises';
import path from 'path';

export class MarkdownParser {
  constructor() {
    this.lastPositions = new Map(); // Track read positions for incremental parsing
  }

  /**
   * Parse a file and return new content since last read
   */
  async parseIncremental(filePath) {
    const content = await fs.readFile(filePath, 'utf-8');
    const lastPosition = this.lastPositions.get(filePath) || 0;
    
    if (content.length <= lastPosition) {
      return null; // No new content
    }

    const newContent = content.slice(lastPosition);
    this.lastPositions.set(filePath, content.length);

    return this.parseContent(newContent, filePath);
  }

  /**
   * Parse content and extract structured events
   */
  parseContent(content, filePath) {
    const filename = path.basename(filePath);
    const events = [];

    // Parse based on file type
    if (filePath.includes('/agents/') && filename === 'history.md') {
      events.push(...this._parseHistoryFile(content));
    } else if (filePath.includes('/decisions/inbox/')) {
      events.push(...this._parseDecisionInbox(content, filename));
    } else if (filePath.includes('/decisions.md')) {
      events.push(...this._parseDecisionLedger(content));
    } else if (filePath.includes('/log/')) {
      events.push(...this._parseSessionLog(content, filename));
    } else if (filePath.includes('/orchestration-log/')) {
      events.push(...this._parseOrchestrationLog(content, filename));
    }

    return events.length > 0 ? events : null;
  }

  /**
   * Parse agent history.md file
   * Format: ## Session {date} ... content ...
   */
  _parseHistoryFile(content) {
    const events = [];
    const sessionPattern = /## Session (\d{4}-\d{2}-\d{2}[^\n]*)\n([\s\S]*?)(?=## Session|\Z)/g;
    
    let match;
    while ((match = sessionPattern.exec(content)) !== null) {
      events.push({
        type: 'agent-learning',
        timestamp: this._parseTimestamp(match[1]),
        content: match[2].trim(),
        raw: match[0]
      });
    }

    // If no sessions found, treat entire content as a single event
    if (events.length === 0 && content.trim()) {
      events.push({
        type: 'agent-output',
        timestamp: new Date().toISOString(),
        content: content.trim(),
        raw: content
      });
    }

    return events;
  }

  /**
   * Parse decision inbox file
   * These are individual decision proposals from agents
   */
  _parseDecisionInbox(content, filename) {
    const agentMatch = filename.match(/^([a-z-]+)-(.+)\.md$/);
    const agentName = agentMatch ? agentMatch[1] : 'unknown';
    const topic = agentMatch ? agentMatch[2] : filename.replace('.md', '');

    return [{
      type: 'decision-proposed',
      timestamp: new Date().toISOString(),
      agentName,
      topic,
      content: content.trim(),
      raw: content
    }];
  }

  /**
   * Parse the main decisions.md ledger
   */
  _parseDecisionLedger(content) {
    const events = [];
    const decisionPattern = /### ([^\n]+)\n([\s\S]*?)(?=###|\Z)/g;

    let match;
    while ((match = decisionPattern.exec(content)) !== null) {
      events.push({
        type: 'decision-merged',
        timestamp: new Date().toISOString(),
        title: match[1].trim(),
        content: match[2].trim(),
        raw: match[0]
      });
    }

    return events;
  }

  /**
   * Parse session log files
   */
  _parseSessionLog(content, filename) {
    // Extract timestamp from filename (e.g., "2024-01-15T10-30-00-topic.md")
    const timestampMatch = filename.match(/^(\d{4}-\d{2}-\d{2}T[\d-]+)/);
    const timestamp = timestampMatch 
      ? this._parseTimestamp(timestampMatch[1]) 
      : new Date().toISOString();

    return [{
      type: 'session-log',
      timestamp,
      content: content.trim(),
      raw: content
    }];
  }

  /**
   * Parse orchestration log files
   * Format: | Field | Value | table
   */
  _parseOrchestrationLog(content, filename) {
    const events = [];
    
    // Extract agent from filename
    const agentMatch = filename.match(/-([a-z-]+)\.md$/);
    const agentName = agentMatch ? agentMatch[1] : 'unknown';

    // Parse table rows
    const rowPattern = /\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|/g;
    const fields = {};
    
    let match;
    while ((match = rowPattern.exec(content)) !== null) {
      const key = match[1].trim().toLowerCase().replace(/\s+/g, '_');
      const value = match[2].trim();
      if (key && value && key !== 'field' && key !== '---') {
        fields[key] = value;
      }
    }

    if (Object.keys(fields).length > 0) {
      events.push({
        type: 'orchestration-event',
        timestamp: new Date().toISOString(),
        agentName,
        fields,
        raw: content
      });
    }

    return events;
  }

  /**
   * Parse various timestamp formats
   */
  _parseTimestamp(str) {
    // Handle formats like "2024-01-15", "2024-01-15T10-30-00", etc.
    const normalized = str.replace(/T(\d{2})-(\d{2})-(\d{2})/, 'T$1:$2:$3');
    const date = new Date(normalized);
    return isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  }

  /**
   * Reset tracking for a file (useful for testing or reprocessing)
   */
  reset(filePath) {
    if (filePath) {
      this.lastPositions.delete(filePath);
    } else {
      this.lastPositions.clear();
    }
  }
}
