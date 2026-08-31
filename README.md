# Ledger

A reconciliation dashboard for order and payment exports.

Two systems that should agree with each other often do not: the order system
records what a store believes it sold, and the payment processor records what
was actually charged, refunded, or settled. This application ingests both
exports, reconciles them deterministically, and surfaces every disagreement in
a dashboard that someone responsible for revenue can act on.

## Status

Work in progress. This README is filled in as the project is built.

## Repository layout

    backend/    FastAPI service: auth, ingestion, reconciliation engine, LLM explanations
    frontend/   React + Vite dashboard
    data/       Sample CSV exports used during development

## Documentation

- Local setup — TODO
- Architecture overview — TODO
- Reconciliation logic and tolerances — TODO
- What we found in the data — TODO
- LLM approach — TODO
