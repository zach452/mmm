/**
 * V4 — Activation guardrails.
 *
 * Real branching rule evaluation that gates whether a proposed spend change may be
 * pushed to an ad platform. Reuses V3's bootstrap credible interval to gate on the
 * lower bound of the marginal-ROAS interval vs. breakeven.
 */
import type { CapacityStatus, Channel } from '../types';
import { bootstrapCredibleInterval } from './v3-bayesian';

export interface ActivationAction {
  dma: string;
  channel: Channel;
  proposedSpendChange: number; // delta $ (can be negative)
  currentSpend: number;
}

export interface GuardrailContext {
  capacityStatus: CapacityStatus;
  creativeReadiness: boolean;
  /** marginal ROAS daily samples — bootstrapped into a CI; OR a precomputed CI. */
  marginalRoasSamples?: number[];
  marginalRoasCI?: { point: number; lower: number; upper: number };
  riskTolerance: 'Conservative' | 'Balanced' | 'Aggressive';
  breakevenRoas?: number;
}

export interface GuardrailResult {
  approved: boolean;
  blockedReasons: string[];
  warnings: string[];
  marginalRoasLower: number;
}

const MAX_STEP_BY_TOLERANCE: Record<GuardrailContext['riskTolerance'], number> = {
  Conservative: 0.2,
  Balanced: 0.5,
  Aggressive: 1.0,
};

const CREATIVE_INCREASE_THRESHOLD = 0.25; // >25% increase needs ready creative

export function evaluateActivationGuardrails(
  action: ActivationAction,
  context: GuardrailContext,
): GuardrailResult {
  const blockedReasons: string[] = [];
  const warnings: string[] = [];

  const increasing = action.proposedSpendChange > 0;
  const pctChange =
    action.currentSpend > 0
      ? action.proposedSpendChange / action.currentSpend
      : increasing
        ? Infinity
        : 0;

  // Rule 1: maxed capacity + increasing spend -> block. A DMA whose bays are full
  // (long waits) cannot service more cars; buying more demand just erodes CX.
  if (context.capacityStatus === 'Maxed' && increasing) {
    blockedReasons.push(
      'Capacity is Maxed (bays full / long waits) — cannot increase spend into demand you cannot service.',
    );
  } else if (context.capacityStatus === 'Constrained' && increasing && pctChange > 0.1) {
    warnings.push('Capacity is Constrained — scaling spend may outrun available service bays.');
  }

  // Rule 2: creative not ready + large increase -> block.
  if (!context.creativeReadiness && increasing && pctChange > CREATIVE_INCREASE_THRESHOLD) {
    blockedReasons.push(
      `Creative not ready for a ${(pctChange * 100).toFixed(0)}% spend increase (>${(CREATIVE_INCREASE_THRESHOLD * 100).toFixed(0)}% threshold).`,
    );
  }

  // Rule 3: marginal ROAS CI lower bound below breakeven.
  const breakeven = context.breakevenRoas ?? 1.0;
  let lower: number;
  if (context.marginalRoasCI) {
    lower = context.marginalRoasCI.lower;
  } else if (context.marginalRoasSamples && context.marginalRoasSamples.length > 0) {
    const ci = bootstrapCredibleInterval(
      (s) => s.reduce((a, b) => a + b, 0) / s.length,
      context.marginalRoasSamples,
      500,
      0.9,
    );
    lower = ci.lower;
  } else {
    lower = breakeven; // no data: neutral
  }

  if (increasing && lower < breakeven) {
    blockedReasons.push(
      `Lower bound of marginal ROAS credible interval (${lower.toFixed(2)}) is below breakeven (${breakeven.toFixed(2)}) — not safe to scale.`,
    );
  } else if (increasing && lower < breakeven * 1.15) {
    warnings.push(
      `Marginal ROAS CI lower bound (${lower.toFixed(2)}) is only marginally above breakeven — thin safety margin.`,
    );
  }

  // Rule 4: large single-step budget change vs. risk tolerance.
  const cap = MAX_STEP_BY_TOLERANCE[context.riskTolerance];
  if (Math.abs(pctChange) > cap && Number.isFinite(pctChange)) {
    warnings.push(
      `Single-step budget change of ${(pctChange * 100).toFixed(0)}% exceeds the ${context.riskTolerance} cap of ${(cap * 100).toFixed(0)}% — consider staging the change.`,
    );
  }

  return {
    approved: blockedReasons.length === 0,
    blockedReasons,
    warnings,
    marginalRoasLower: Math.round(lower * 100) / 100,
  };
}
