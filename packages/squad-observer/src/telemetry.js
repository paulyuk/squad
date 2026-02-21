/**
 * Telemetry Emitter - Sends OpenTelemetry spans to Jaeger
 */

import { trace, SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { BasicTracerProvider, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-node';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

export class TelemetryEmitter {
  constructor(options = {}) {
    this.options = {
      serviceName: options.serviceName || 'squad-agents',
      serviceVersion: options.serviceVersion || '0.1.0',
      endpoint: options.endpoint || process.env.JAEGER_ENDPOINT || 'http://localhost:14268/api/traces',
      ...options
    };
    
    this.provider = null;
    this.tracer = null;
    this.exporter = null;
    this.activeSpans = new Map();
  }

  /**
   * Initialize OpenTelemetry with Jaeger exporter
   */
  async start() {
    // Normalize endpoint for Jaeger
    let endpoint = this.options.endpoint;
    if (!endpoint.includes('/api/traces')) {
      // Convert OTLP-style endpoints to Jaeger format
      endpoint = endpoint.replace(/:\d+.*$/, ':14268/api/traces');
    }
    
    this.exporter = new JaegerExporter({
      endpoint: endpoint,
    });

    this.provider = new BasicTracerProvider({
      resource: new Resource({
        [ATTR_SERVICE_NAME]: this.options.serviceName,
        [ATTR_SERVICE_VERSION]: this.options.serviceVersion,
      }),
    });

    // Use SimpleSpanProcessor for immediate export
    this.provider.addSpanProcessor(new SimpleSpanProcessor(this.exporter));
    this.provider.register();
    
    this.tracer = trace.getTracer(this.options.serviceName, this.options.serviceVersion);
    
    return this;
  }

  /**
   * Shutdown gracefully with flush
   */
  async stop() {
    // End any active spans
    for (const [, span] of this.activeSpans) {
      span.end();
    }
    this.activeSpans.clear();

    if (this.provider) {
      await this.provider.forceFlush();
      await this.provider.shutdown();
      this.provider = null;
    }
  }

  /**
   * Emit a span for an agent event - with FULL content visibility
   */
  emitAgentEvent(event) {
    if (!this.tracer) {
      console.warn('Telemetry not initialized, skipping event:', event.type);
      return;
    }

    const agentName = event.agentName || 'squad';
    const content = event.content || '';
    
    // Create a descriptive span name with content preview
    const contentPreview = content
      .replace(/[#\n\r]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 60);
    
    const emoji = this._getEmoji(event.type);
    const spanName = `${emoji} ${agentName}: ${contentPreview || event.type}`;

    const span = this.tracer.startSpan(spanName, {
      kind: SpanKind.INTERNAL,
      attributes: {
        'agent': agentName,
        'role': this._getAgentRole(agentName),
        'type': event.type,
      },
    });

    // Add the OUTPUT as log events - this is what shows in Jaeger Logs tab
    // Split content into chunks so it's readable
    const lines = content.split('\n').filter(l => l.trim());
    
    // Add header event
    span.addEvent('📋 Agent Output', {
      'agent': agentName,
      'type': event.type,
      'file': event.filename || 'unknown',
    });
    
    // Add each meaningful line as a separate event (shows as logs)
    for (let i = 0; i < Math.min(lines.length, 20); i++) {
      const line = lines[i].trim();
      if (line && line.length > 2) {
        span.addEvent(line.substring(0, 200));
      }
    }
    
    // Add full content as final event
    if (content.length > 0) {
      span.addEvent('📝 Full Content', {
        'output': content.substring(0, 4000),
      });
    }

    span.setStatus({ code: SpanStatusCode.OK });
    span.end();

    return span;
  }

  /**
   * Get emoji for event type
   */
  _getEmoji(type) {
    const emojis = {
      'agent-learning': '🧠',
      'agent-output': '📝',
      'decision-proposed': '💡',
      'decision-merged': '✅',
      'session-log': '📋',
      'orchestration-event': '🎯',
    };
    return emojis[type] || '📌';
  }

  /**
   * Start a long-running span for an agent session
   */
  startAgentSession(agentName, taskDescription) {
    if (!this.tracer) return null;

    const span = this.tracer.startSpan(`agent.session.${agentName}`, {
      kind: SpanKind.INTERNAL,
      attributes: {
        'agent.name': agentName,
        'agent.task': taskDescription,
        'agent.started_at': new Date().toISOString(),
      },
    });

    this.activeSpans.set(agentName, span);
    return span;
  }

  /**
   * End an agent session span
   */
  endAgentSession(agentName, status = 'completed') {
    const span = this.activeSpans.get(agentName);
    if (span) {
      span.setAttribute('agent.status', status);
      span.setStatus({ 
        code: status === 'error' ? SpanStatusCode.ERROR : SpanStatusCode.OK 
      });
      span.end();
      this.activeSpans.delete(agentName);
    }
  }

  /**
   * Generate human-readable span name
   */
  _getSpanName(event) {
    const agent = event.agentName ? event.agentName.charAt(0).toUpperCase() + event.agentName.slice(1) : 'Squad';
    
    switch (event.type) {
      case 'agent-learning':
        return `🧠 ${agent} learned something`;
      case 'agent-output':
        return `📝 ${agent} output`;
      case 'decision-proposed':
        return `💡 ${agent} proposed decision`;
      case 'decision-merged':
        return `✅ Decision merged`;
      case 'session-log':
        return `📋 Session log`;
      case 'orchestration-event':
        return `🎯 ${agent} task completed`;
      default:
        return `${agent}: ${event.type}`;
    }
  }

  /**
   * Get agent role from name
   */
  _getAgentRole(name) {
    const roles = {
      'architect': 'Design Lead',
      'engineer': 'Builder', 
      'pm': 'Product Manager',
      'qa': 'Quality Assurance',
      'docs': 'Documentation',
      'scribe': 'Team Scribe',
      'ralph': 'Work Monitor',
    };
    return roles[name?.toLowerCase()] || 'Agent';
  }

  /**
   * Extract span attributes from event (kept for compatibility)
   */
  _getAttributes(event) {
    const attrs = {
      'squad.event_type': event.type,
      'squad.timestamp': event.timestamp,
    };

    if (event.agentName) {
      attrs['squad.agent_name'] = event.agentName;
    }

    if (event.topic) {
      attrs['squad.topic'] = event.topic;
    }

    if (event.title) {
      attrs['squad.title'] = event.title;
    }

    if (event.fileType) {
      attrs['squad.file_type'] = event.fileType;
    }

    if (event.fields) {
      // Flatten orchestration fields
      for (const [key, value] of Object.entries(event.fields)) {
        attrs[`squad.orchestration.${key}`] = value;
      }
    }

    return attrs;
  }
}
