# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/) for every commit:

```
<type>(<scope>): <description>
```

Common types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`, `build`, `ci`.
Scope is optional but preferred when the change is localized (e.g. `feat(light): ...`).
Keep the description short, imperative, lowercase, no trailing period.

## Releases

- Bump `version` in `package.json` (`npm version patch|minor|major`, or manually).
- Update `CHANGELOG.md` (`[Unreleased]` section -> new version heading, dated).
- Tag releases as `vX.Y.Z` and push tags to origin — this triggers the `publish` GitHub Actions workflow, which builds, tests, and publishes to npm with provenance (`npm publish --provenance`). No manual `npm publish` needed.
