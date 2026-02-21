/**
 * Squad Observer - Real-time agent observability
 * 
 * Watches .squad/ directory for agent activity and emits OpenTelemetry
 * spans to Aspire Dashboard (or any OTLP-compatible endpoint).
 */

export { SquadObserver } from './observer.js';
export { FileWatcher } from './watcher.js';
export { MarkdownParser } from './parser.js';
export { TelemetryEmitter } from './telemetry.js';
