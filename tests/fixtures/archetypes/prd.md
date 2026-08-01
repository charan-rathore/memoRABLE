# Product Requirements — Indent PO GRN Edit History

As of 2026-07-01. Mid-market onboarding PRD for purchase workflow auditability.

## Goals
- Every PO edit must leave an audit trail
- Amended quantities cannot silently reduce approved spend

## Decisions
- D-001 PO edit history is mandatory on every change — approved
- D-002 Quantity reductions after approval require finance re-approval — approved

## Timeline
- Phase 1: Capture edit history schema — planned
- Phase 2: Wire approval workflow — planned (blocked by Phase 1)
- Phase 3: Finance permissions — planned

## Risks
- Missing audit trail exposes compliance gaps (high) - mitigation: ship Phase 1 before any UI edit path
- Users bypass amendments via side channels (medium) - mitigation: lock fields after approval

## Actions
- [ ] Spec the revision number format - Platform - Aug 1
- [ ] Implement approval workflow hooks - Backend - Aug 15
