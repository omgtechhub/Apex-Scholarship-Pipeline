# Scholarship Automation Pipeline — Three-Build Consolidation

This repository was consolidated from the three Arena builds supplied by the project owner.

## Canonical base

Build 3 (`scholarship pipeline 3`) is the canonical base for overlapping runtime implementations because it is the latest build and contains the newer publishing, SEO, validation-worker, and channel-message work.

## Integrated from Build 2

Unique runtime capabilities retained and adapted to the canonical architecture:

- 30-minute scheduler
- cleanup worker
- notification worker
- runtime scheduler/worker entrypoints
- package dependencies required by the three builds
- Arena/Claude/Windsurf Prisma skill metadata

## Integrated from Build 1

Unique reusable capabilities retained and adapted:

- authentication service foundation
- JWT service
- password hashing service
- RBAC permission service
- authentication middleware
- reusable Zod validators
- validation/formatting utilities
- repository-layer foundation for the current Prisma models

Older Build 1 implementations that directly depended on its incompatible legacy Prisma schema were not copied verbatim; their functionality was adapted to the canonical Build 3 schema instead. This prevents multiple competing ORM/schema contracts from being present in the final repository.

## Deliberately canonicalized duplicates

Where the same path existed in multiple builds, only one implementation is retained. Build 3 wins for overlapping crawler, processing, AI, SEO, queue, utility, and database implementations unless a unique Build 2/Build 1 capability was required to complete the merged architecture.

## Important

This is a consolidation of the three supplied builds, not a claim that the overall Scholarship Automation Pipeline is now 100% complete. The merged repository should be used as the single source of truth for the next completion pass.
