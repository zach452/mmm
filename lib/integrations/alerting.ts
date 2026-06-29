/**
 * V4 — Stub alert connectors (NO real webhook/SMTP credentials).
 *
 * Implement a shared AlertConnector interface; log to console and return a clearly
 * simulated result. Production V5 would post to a real Slack webhook / send via SMTP.
 */
import type { AlertConnector, AlertResult, ConnectionStatus } from './types';

export class SlackAlertStubConnector implements AlertConnector {
  async send(message: {
    title: string;
    body: string;
    severity: 'info' | 'warning' | 'critical';
  }): Promise<AlertResult> {
    console.log(`[Slack STUB] (${message.severity}) ${message.title}: ${message.body}`);
    return {
      success: true,
      simulated: true,
      channel: 'Slack',
      note: 'Stub alert — V5 would POST to a real Slack incoming webhook (requires webhook URL secret).',
    };
  }

  getConnectionStatus(): ConnectionStatus {
    return {
      platform: 'Slack',
      state: 'stub',
      note: 'Stub connector — requires a real Slack webhook URL in V5+.',
    };
  }
}

export class EmailAlertStubConnector implements AlertConnector {
  async send(message: {
    title: string;
    body: string;
    severity: 'info' | 'warning' | 'critical';
  }): Promise<AlertResult> {
    console.log(`[Email STUB] (${message.severity}) ${message.title}: ${message.body}`);
    return {
      success: true,
      simulated: true,
      channel: 'Email',
      note: 'Stub alert — V5 would send via real SMTP / a transactional email provider (requires SMTP credentials).',
    };
  }

  getConnectionStatus(): ConnectionStatus {
    return {
      platform: 'Email',
      state: 'stub',
      note: 'Stub connector — requires real SMTP credentials in V5+.',
    };
  }
}
