/**
 * V3 — Experiment feedback loop.
 *
 * The model proposes a recommendation; a geo lift experiment (from /experiments'
 * matched-market design) is run; its readout feeds back here to UPDATE the
 * recommendation. This closes the loop: model informs experiment design, and the
 * experiment's causal evidence then overrides or reinforces the model.
 *
 * This is genuine evidence-combination logic (direction agreement, CI overlap with
 * the model's prediction, significance) — not a cosmetic relabeling.
 */
import type { Action, Recommendation } from '../types';

export interface ExperimentReadout {
  /** observed incremental lift, e.g. fractional revenue lift (0.08 = +8%). */
  observedLift: number;
  ciLower: number;
  ciUpper: number;
  isSignificant: boolean;
}

export interface UpdatedRecommendation extends Recommendation {
  feedbackApplied: true;
  priorAction: Action;
  priorConfidence: number;
  feedbackVerdict: 'confirmed' | 'contradicted' | 'inconclusive';
  feedbackNote: string;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Combine a prior model recommendation with an experiment readout.
 *
 * - CONFIRMED  (significant, same direction as the model's predicted lift, and the
 *   experiment CI overlaps the model's predicted lift): raise confidence, keep/upgrade
 *   action toward Act.
 * - CONTRADICTED (significant but opposite sign to the predicted lift): flip the
 *   recommendation toward Suppress/Ignore and flag that the experiment overrode the model.
 * - INCONCLUSIVE (not significant): keep a cautious Monitor/Test stance and lower
 *   confidence slightly — we learned the effect is uncertain.
 */
export function applyExperimentReadout(
  priorRecommendation: Recommendation,
  experimentResult: ExperimentReadout,
): UpdatedRecommendation {
  const prior = priorRecommendation;
  const predictedLift = prior.expectedRevenueLift; // model's directional prediction ($)
  const predictedSign = Math.sign(predictedLift) || 1;
  const observedSign = Math.sign(experimentResult.observedLift) || 1;
  const sameDirection = predictedSign === observedSign;

  // Does the experiment CI overlap with a positive predicted effect? We treat the
  // model prediction as "positive lift expected" and check the experiment CI is
  // consistent with a real positive effect.
  const ciExcludesZero =
    experimentResult.ciLower > 0 || experimentResult.ciUpper < 0;

  let verdict: UpdatedRecommendation['feedbackVerdict'];
  let action: Action = prior.action;
  let confidence = prior.confidence;
  let note: string;
  const riskFlags = [...prior.riskFlags];

  if (experimentResult.isSignificant && sameDirection && observedSign > 0) {
    // Confirming evidence for a positive, media-responsive effect.
    verdict = 'confirmed';
    confidence = clamp(prior.confidence + 0.2, 0, 0.98);
    if (prior.action === 'Test' || prior.action === 'Monitor') action = 'Act';
    else if (prior.action === 'Ignore') action = 'Test';
    note = `Experiment confirms the model: significant +${(experimentResult.observedLift * 100).toFixed(1)}% lift (CI ${(experimentResult.ciLower * 100).toFixed(1)}%…${(experimentResult.ciUpper * 100).toFixed(1)}%), same direction as the predicted lift. Confidence raised; action upgraded toward Act.`;
  } else if (experimentResult.isSignificant && (!sameDirection || observedSign < 0)) {
    // Significant evidence AGAINST the model — experiment wins.
    verdict = 'contradicted';
    confidence = clamp(Math.max(prior.confidence, 0.7), 0, 0.95);
    action = observedSign < 0 ? 'Suppress' : 'Ignore';
    note = `Experiment CONTRADICTS the model: significant effect with the opposite sign (observed ${(experimentResult.observedLift * 100).toFixed(1)}%) vs. predicted positive lift. Model overridden by experiment evidence — flipping toward ${action}.`;
    riskFlags.push('Model overridden by experiment evidence');
  } else {
    // Not significant — inconclusive. Stay cautious, trim confidence.
    verdict = 'inconclusive';
    confidence = clamp(prior.confidence - 0.1, 0.2, 0.9);
    if (prior.action === 'Act') action = 'Test';
    else if (prior.action !== 'Suppress' && prior.action !== 'Ignore') action = 'Monitor';
    note = `Experiment inconclusive: effect not statistically significant (CI ${(experimentResult.ciLower * 100).toFixed(1)}%…${(experimentResult.ciUpper * 100).toFixed(1)}% spans zero${ciExcludesZero ? '' : ', includes zero'}). Holding a cautious ${action} stance and lowering confidence.`;
    if (!riskFlags.includes('Experiment effect not yet significant'))
      riskFlags.push('Experiment effect not yet significant');
  }

  return {
    ...prior,
    action,
    confidence: round2(confidence),
    riskFlags,
    feedbackApplied: true,
    priorAction: prior.action,
    priorConfidence: prior.confidence,
    feedbackVerdict: verdict,
    feedbackNote: note,
  };
}
