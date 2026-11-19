# Finsight v3 — Portfolio Implementation Specification

## Project Objective

Finsight is a fully deployable AI-powered financial advisor built to demonstrate senior-level software engineering, product thinking, AI architecture, and reliability engineering.

This project is **not intended to become a production startup**.

Every implementation decision should maximize engineering signal while keeping the architecture simple, readable and maintainable.

The final result should be something that a recruiter or senior engineer can explore within 10 minutes and immediately understand the engineering maturity behind the system.

---

# Engineering Philosophy

The project should demonstrate:

- Product Thinking
- AI System Design
- Reliability Engineering
- Explainable AI
- Performance Optimization
- Clean Software Architecture
- Production-quality Code
- Excellent Documentation

Do NOT optimize for enterprise complexity.

Prefer:

Simple
Readable
Maintainable

over

Highly configurable
Enterprise scale
Microservices

---

# Implementation Rules

These rules apply throughout the implementation.

1. Never introduce unnecessary abstraction.

2. Never introduce infrastructure that isn't required.

Do NOT introduce:

- Redis
- Kafka
- RabbitMQ
- Celery
- Kubernetes
- Docker Swarm
- Distributed Cache

3. Prefer in-memory implementations whenever they demonstrate the same engineering concept.

4. Every feature must have an engineering purpose.

5. Every task must compile before moving to the next task.

6. Every task must include unit tests.

7. Commit after every completed task.

8. Never modify unrelated files.

---

# Overall Architecture

The architecture should remain simple.

User

↓

React Frontend

↓

FastAPI Backend

↓

Trust Layer

↓

Knowledge Layer

↓

LLM

↓

Response

Supporting Layers

- Cache
- Observability
- Reliability
- Financial Calculators

---

# Phase 0

## Shared Contracts

Create shared contracts before implementing any feature.

Files

core/errors.py

core/types.py

core/interfaces.py

These should contain

- Error enums
- Request models
- Response models
- SourceResult enum
- Cache interfaces
- Shared dataclasses

No implementation logic belongs here.

Everything else depends on these contracts.

---

# Phase 1

# Task A

## Portfolio Landing Experience

Goal

A recruiter should understand the project within twenty seconds.

Create

- Landing Page
- Architecture Page
- System Health Page

Landing Page should explain

- What Finsight does
- Why it is different
- Trust philosophy
- Technical highlights
- Educational disclaimer

Architecture Page should visually explain

User

↓

Frontend

↓

API

↓

Trust Layer

↓

Knowledge Layer

↓

LLM

↓

Response

Each block should explain

Purpose

Inputs

Outputs

Failure Handling

System Health page should display

- Source freshness
- Cache status
- Average latency
- Circuit breaker state
- Response time
- API health

---

# Phase 2

# Task B

## Explainability Engine

Replace simple confidence percentages with explainable confidence.

Confidence should contain

- Sources
- Freshness
- Coverage
- Reflection
- Missing Information

Users should understand WHY confidence changed.

Example

Confidence

91%

↓

Reduced because

• One source unavailable

• Data is 12 hours old

• Reflection skipped

Create

Trust Thermometer component

Expandable explanation panel

---

# Task C

## Prompt Modes

Support three response modes.

Standard

Explain Like I'm Five

Professional

Never modify the user's original question.

Only modify prompt construction.

Prompt mode should become part of request metadata.

---

# Phase 3

# Task D

## Reliability Layer

Implement

Structured Errors

Request Timeouts

Async Chat

Retry Logic

Semaphore

Circuit Breaker

Graceful Degradation

Health Endpoint

Keep circuit breakers simple.

Use in-memory implementation.

Do NOT persist breaker state.

Purpose is demonstrating reliability patterns.

---

# Task E

## AI Response Cache

Implement

TTL Cache

LRU Eviction

Per-key Locking

Profile-aware Cache Keys

Fallback Chain

Flow

Cache

↓

FAQ

↓

LLM

↓

Graceful Degradation

Cache should expose

Hit Rate

Miss Rate

Entries

TTL

---

# Phase 4

# Task F

## Financial Intelligence

Create

Interactive What-if Simulator

Support

Increase SIP

Decrease SIP

Pause SIP

Market Crash

Higher Return

Inflation

Annual Step-up

Display

Interactive Charts

Investment Timeline

Explanation

Assumptions

Educational Disclaimer

No investment recommendations.

---

# Task G

## Fund Explorer

Create

Fund Explorer

Each fund should display

- Returns
- Expense Ratio
- Risk
- Lock-in
- Category

Add

Explain Difference

button

The explanation should combine

Deterministic calculations

+

LLM reasoning

No Winner labels.

No recommendations.

Educational only.

---

# Phase 5

# Task H

## Observability

Implement

Correlation IDs

Request Timing

Latency Metrics

Cache Hit Ratio

LLM Latency

Source Latency

Health Dashboard

Display

Average Response Time

95th Percentile

Cache Hit Ratio

Circuit Breakers

Source Status

Request Volume

Purpose

Demonstrate operational maturity.

---

# Phase 6

# Task I

## Performance Optimization

Implement

Source Hash Deduplication

Batch Fetching

Skip Unchanged LLM Calls

Retention Policy

Track

Skipped LLM Calls

Saved Tokens

Saved Time

Average Latency Improvement

Display these metrics on the System Health page.

---

# Frontend

Use

React

TailwindCSS

Recharts

Lucide Icons

Dark Mode

Responsive Layout

Maintain consistent component design.

---

# Backend

Use

FastAPI

SQLite

Async Endpoints

Pydantic

Keep business logic separated from API routes.

---

# Testing

Every task must include

Unit Tests

Integration Tests

Playwright End-to-End Tests

Implementation is not complete until tests pass.

---

# Documentation

Produce

README

Architecture Overview

API Documentation

Deployment Guide

Tradeoffs

Design Decisions

Every major subsystem should explain

Why it exists

Alternative approaches

Tradeoffs

Future improvements

---

# Deployment

Frontend

Vercel

Backend

Railway

SQLite Persistent Volume

Environment Validation

Automatic Deployment

Health Endpoint

Ready for public demonstration.

---

# Success Criteria

The completed project should demonstrate

✓ AI Product Thinking

✓ Reliability Engineering

✓ Explainable AI

✓ Performance Optimization

✓ Clean Architecture

✓ Production-quality Code

✓ Excellent Documentation

✓ Interactive UI

✓ Live Deployment

✓ Maintainable Codebase

The project should feel like something designed by an experienced Staff or Principal Engineer while remaining understandable and intentionally simple.

---

# Implementation Workflow (IMPORTANT)

Implement ONLY ONE TASK at a time.

Workflow

1. Read the current task.

2. Inspect only the files required for that task.

3. Implement the feature.

4. Run tests.

5. Fix compilation issues.

6. Run tests again.

7. Commit.

8. Stop.

Never continue into the next task automatically.

Wait for explicit approval before beginning the next task.

Do not refactor unrelated code.

Do not redesign previous tasks unless required for correctness.

The objective is to produce a stable, deployable portfolio project through incremental, verifiable implementation.