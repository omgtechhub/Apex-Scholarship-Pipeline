# Integrated Merge Manifest

Base: scholarship-automation-pipeline-merged-combined
Integrated source: complete-scholarship-automation-pipeline (1)(1)

Merge policy:
- The existing merged repository remains the source of truth for the Prisma-based architecture.
- Conflicting Drizzle-based implementations from the secondary build were NOT copied wholesale because doing so would create two database/ORM architectures and duplicate services.
- Compatible functionality was ported into the existing architecture.
- Unique API/runtime/worker capabilities were added where compatible.
