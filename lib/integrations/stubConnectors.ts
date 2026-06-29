/**
 * V4 — Stub platform activation connectors (NO real credentials).
 *
 * These implement the ActivationConnector interface but DO NOT call any external
 * service. They run the real guardrail check first and refuse to "push" if guardrails
 * block. On approval they return a clearly-labeled simulated result. A production V5
 * would replace the body of pushBudgetChange with a real authenticated API call.
 */
import type { ActivationConnector, ActivationResult, ConnectionStatus } from './types';
import type { ActivationAction, GuardrailContext } from '../modeling/v4-guardrails';
import { evaluateActivationGuardrails } from '../modeling/v4-guardrails';

abstract class BaseStubConnector implements ActivationConnector {
  abstract platform: string;
  abstract apiNote: string;

  async pushBudgetChange(
    action: ActivationAction,
    newDailyBudget: number,
    guardrailContext: GuardrailContext,
  ): Promise<ActivationResult> {
    const guard = evaluateActivationGuardrails(action, guardrailContext);
    if (!guard.approved) {
      return {
        success: false,
        simulated: true,
        platform: this.platform,
        dma: action.dma,
        channel: action.channel,
        newDailyBudget,
        note: `Refused by guardrails (no platform call made). ${this.apiNote}`,
        blockedReasons: guard.blockedReasons,
        warnings: guard.warnings,
      };
    }
    console.log(
      `[${this.platform} STUB] Would push daily budget $${newDailyBudget} for ${action.dma}/${action.channel}. ${this.apiNote}`,
    );
    return {
      success: true,
      simulated: true,
      platform: this.platform,
      dma: action.dma,
      channel: action.channel,
      newDailyBudget,
      note: `Stub connector — V5 would call ${this.apiNote}`,
      warnings: guard.warnings,
    };
  }

  getConnectionStatus(): ConnectionStatus {
    return {
      platform: this.platform,
      state: 'stub',
      note: `Stub connector — requires production OAuth credentials in V5+. ${this.apiNote}`,
    };
  }
}

export class MetaAdsStubConnector extends BaseStubConnector {
  platform = 'Meta Ads';
  apiNote = 'the real Meta Marketing API with OAuth credentials';
}

export class GoogleAdsStubConnector extends BaseStubConnector {
  platform = 'Google Ads';
  apiNote = 'the real Google Ads API with OAuth credentials';
}
