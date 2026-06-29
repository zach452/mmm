/**
 * V4 — Platform activation connector interfaces.
 *
 * These define the contract a real ad-platform integration must satisfy. The concrete
 * implementations in this demo (stubConnectors.ts, alerting.ts) are CLEARLY-LABELED
 * stubs: they run the real guardrail logic but return simulated/no-op results. A
 * production V5 would implement these same interfaces against the real Meta Marketing
 * API, Google Ads API, Slack webhooks, and SMTP — gated behind OAuth/credentials that
 * do not exist in this demo environment.
 */
import type { Channel } from '../types';
import type { ActivationAction, GuardrailContext } from '../modeling/v4-guardrails';

export type ConnectionState = 'connected' | 'stub' | 'disconnected' | 'error';

export interface ConnectionStatus {
  platform: string;
  state: ConnectionState;
  note: string;
}

export interface ActivationResult {
  success: boolean;
  simulated: boolean;
  platform: string;
  dma: string;
  channel: Channel;
  newDailyBudget: number;
  note: string;
  blockedReasons?: string[];
  warnings?: string[];
}

export interface ActivationConnector {
  pushBudgetChange(
    action: ActivationAction,
    newDailyBudget: number,
    guardrailContext: GuardrailContext,
  ): Promise<ActivationResult>;
  getConnectionStatus(): ConnectionStatus;
}

export interface AlertResult {
  success: boolean;
  simulated: boolean;
  channel: string;
  note: string;
}

export interface AlertConnector {
  send(message: { title: string; body: string; severity: 'info' | 'warning' | 'critical' }): Promise<AlertResult>;
  getConnectionStatus(): ConnectionStatus;
}
