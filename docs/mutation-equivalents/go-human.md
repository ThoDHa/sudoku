# Mutation Equivalents: Go `internal/sudoku/human`

Index of inline `// mutator-disable-*` annotations in
`api/internal/sudoku/human/technique_registry.go`.

## Summary

- **Package:** `internal/sudoku/human`
- **Total mutants (after annotations):** 684
- **Killed:** 684 (100%)
- **Annotated equivalents:** 80 (78 Order field + 2 nil guard)
- **Convergence:** verified locally (background run, 100%)

## Equivalence Categories

### 1. Order field metadata (78 mutants, `// mutator-disable-regexp`)

The `Order` field in `TechniqueDescriptor` is pedagogical metadata documenting
the intended learning progression of solving techniques. It is set during
registration (values 1-24) but **never read in production code**. The solver's
execution order comes from `tierOrder`, a map of tier → slug list populated in
registration sequence, not from the `Order` field.

The only consumer is `technique_helpers_test.go` (a test utility), not the
solver itself. Mutating Order values ±1 changes only the metadata, not behavior.

Annotation: `// mutator-disable-regexp Order:\s+\d+ numbers/decrementer, numbers/incrementer`

### 2. Defensive nil guard (2 mutants, `// mutator-disable-regexp`)

The technique lookup guard `tech != nil && tech.Enabled` protects against nil
map lookups. In practice, `tierOrder` only contains slugs that were registered,
so `r.techniques[slug]` is never nil for any reachable slug. The nil guard is
dead defensive code.

Annotation: `// mutator-disable-regexp tech != nil expression/remove`
