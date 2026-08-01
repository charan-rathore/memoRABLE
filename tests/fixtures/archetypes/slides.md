# Architecture Deck Outline

## Slide 1 — Problem
Mid-market buyers cannot audit PO edits after approval.

## Slide 2 — System
Indent service writes immutable revision events to the audit log.

## Slide 3 — Flow
User edits PO → approval check → revision number increments → finance notified.

## Slide 4 — Open questions
Who owns retention of audit events beyond 24 months?
