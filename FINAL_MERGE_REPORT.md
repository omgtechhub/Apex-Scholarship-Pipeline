# Merge Report

Canonical base:
scholarship-automation-pipeline-final-integrated.zip

Incoming build:
complete-scholarship-automation-pipeline(4).zip

## Result
The canonical master project was preserved as the source of truth.
The incoming build was compared file-by-file.

### Additive files integrated
- src/pipeline/crawler/adapters/generic.adapter.ts

### Conflicting files
The incoming build contained 70 paths that already existed in the canonical master.
Those were NOT blindly overwritten. The canonical implementations were retained to avoid regressions and architectural conflicts.

### Important
The incoming build contains a different Prisma schema/auth implementation that introduces a RefreshToken model but also removes/changes existing master schema structures. Because replacing the master generated Prisma client/schema would risk breaking existing pipeline components, those conflicting versions were not substituted.

The resulting project therefore preserves the master architecture and adds only genuinely additive functionality from the incoming build.

Generated Prisma artifacts should be regenerated with:
npx prisma generate

after any intentional schema changes.
