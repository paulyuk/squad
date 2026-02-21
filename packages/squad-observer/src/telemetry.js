/**
 * Telemetry Emitter - Sends OpenTelemetry spans to Aspire Dashboard
 */

import { trace, SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

export class TelemetryEmitter {
  constructor(options = {}) {
    this.options = {
      serviceName: options.serviceName || 'squad-observer',
      serviceVersion: options.serviceVersion || '0.1.0',
      endpoint: options.endpoint || process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:18889/v1/traces',
      ...options
    };
    
    this.sdk = null;
    this.tracer = null;
    this.activeSpans = new Map(); // Track active agent spans
  }

  /**
   * Initialize OpenTelemetry SDK
   */
  async start() {
    const exporter = new OTLPTraceExporter({
      url: this.options.endpoint,
    });

    this.sdk = new NodeSDK({
      resource: new Resource({
        [ATTR_SERVICE_NAME]: this.options.serviceName,
        [ATTR_SERVICE_VERSION]: this.options.serviceVersion,
      }),
      traceExporter: exporter,
    });

    await this.sdk.start();
    this.tracer = trace.getTracer(this.options.serviceName, this.options.serviceVersion);
    
    return this;
  }

  /**
   * Shutdown the SDK gracefully
   */
  async stop() {
    // End any active spans
    for (const [, span] of this.activeSpans) {
      span.end();
    }
    this.activeSpans.clear();

    if (this.sdk) {
      await this.sdk.shutdown();
      this.sdk = null;
    }
  }

  /**
   * Emit a span for an agent event
   */
  emitAgentEvent(event) {
    if (!this.tracer) {
      console.warn('Telemetry not initialized, skipping event:', event.type);
      return;
    }

    const spanName = this._getSpanName(event);
    const attributes = this._getAttributes(event);

    const span = this.tracer.startSpan(spanName, {
      kind: SpanKind.INTERNAL,
      attributes,
    });

    // Add event content as span event
    span.addEvent(event.type, {
      'event.content': event.content?.substring(0, 1000) || '', // Truncate long content
      'event.timestamp': event.timestamp,
    });

    span.setStatus({ code: SpanStatusCode.OK });
    span.end();

    return span;
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
   * Generate span name from event
   */
  _getSpanName(event) {
    const agentPart = event.agentName ? `.${event.agentName}` : '';
    
    switch (event.type) {
      case 'agent-learning':
        return `agent${agentPart}.learning`;
      case 'agent-output':
        return `agent${agentPart}.output`;
      case 'decision-proposed':
        return `decision${agentPart}.proposed`;
      case 'decision-merged':
        return `decision.merged`;
      case 'session-log':
        return `session.log`;
      case 'orchestration-event':
        return `orchestration${agentPart}.event`;
      default:
        return `squad.${event.type}`;
    }
  }

  /**
   * Extract span attributes from event
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
