## Description

<!-- Explain what this PR does and why. Link to the relevant issue or ticket. -->

Closes #<!-- issue number -->

---

## Type of change

<!-- Check all that apply. -->

- [ ] New feature
- [ ] Bug fix
- [ ] Refactor (no behaviour change)
- [ ] Performance improvement
- [ ] Infrastructure / DevOps change
- [ ] Documentation update
- [ ] Dependency update
- [ ] Other (describe below)

---

## What changed

<!-- Brief bullet-point summary of the implementation. -->

-
-

---

## How to test

<!-- Steps to verify this works correctly. Include any env vars, seed data, or
     setup needed so a reviewer can reproduce your test scenario. -->

1.
2.

---

## Checklist

<!-- All items must be checked before requesting review. -->

**Code quality**
- [ ] I have run `ruff check` and `ruff format` locally (Python changes)
- [ ] I have run `biome check` locally (TypeScript/JS changes)
- [ ] No new type errors (`mypy` / `tsc --noEmit`)

**Tests**
- [ ] New behaviour is covered by automated tests
- [ ] All existing tests pass locally
- [ ] Edge cases and error paths are tested

**Documentation**
- [ ] Inline code comments added where the logic is non-obvious
- [ ] Public API / function docstrings updated if changed
- [ ] `CLAUDE.md` updated if this affects the development workflow

**Infrastructure / deployment**
- [ ] Migrations are backwards-compatible (no breaking schema changes without a plan)
- [ ] New env vars are documented and added to the Railway / Vercel dashboards
- [ ] Docker images still build cleanly (`docker build apps/<service>`)
- [ ] No secrets or credentials are committed

---

## Screenshots / recordings

<!-- For UI changes: before / after screenshots or a short screen recording. -->

---

## Additional context

<!-- Anything else reviewers should know: trade-offs, follow-up tickets, etc. -->
