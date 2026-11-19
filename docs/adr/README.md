# Architecture decision records

One file per decision, named `NNNN-slug.md`. An accepted ADR is never rewritten: a new ADR supersedes it and the old one is marked `superseded by ADR NNNN`. Where a reason was not written down at the time, the ADR says "not recorded".

| ADR | Decision | Status | Date |
|---|---|---|---|
| [0001](0001-shared-core-two-shells.md) | One shared core with two app shells (web and React Native) | accepted | 2026-11-16 |
| [0002](0002-kinfall-name-and-tester-distribution.md) | The game is named Kinfall; Android tester builds go only through Firebase App Distribution | accepted | 2026-11-19 |

## New ADR

Copy this skeleton, number it next and add a row above.

```md
# ADR NNNN: <decision as a sentence>

- **Status:** proposed | accepted | superseded by ADR NNNN
- **Date:** YYYY-MM-DD
- **Area:** <area>

## Context
Facts only.

## Decision
Present tense.

## Consequences
Benefits, costs and how it is checked.

## Alternatives considered
```
