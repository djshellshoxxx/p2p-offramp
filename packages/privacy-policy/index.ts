/** Optional local policy/plan orchestration. No production providers, endpoints, protected badge or spending authority. */
export { POLICY_LIMITS, parsePolicy, diffPolicy } from './src/policy.ts';
export type { CapabilityReference, FeaturePolicy, PolicyDiff } from './src/policy.ts';
export { createPolicyRuntime, evaluatePolicy, validatePrivacyPlan } from './src/plan.ts';
export type { PolicyRuntime, PolicyRuntimeOptions, CapabilityNode, PolicyEvaluation, NodeEvaluation, PlanReason, UnbrokeredPath } from './src/plan.ts';
export { createModeController } from './src/mode.ts';
export type { ModeController, ModeControllerOptions, ModeSnapshot, ModePhase } from './src/mode.ts';
