# Contributing Guide

Welcome to the Smart Digital Invoicing System (FBR Integration) FYP project.

---

## Branching Strategy

| Branch | Purpose |
|---|---|
| `main` | Production-ready code only. Never commit directly. |
| `develop` | Integration branch. All features merge here first. |
| `feature/<task-id>-<short-description>` | Feature development (e.g. `feature/2.1.1-user-registration`) |
| `fix/<description>` | Bug fixes during development |
| `hotfix/<description>` | Emergency production fixes only |

### Rules
- **Never** push directly to `main` or `develop`
- All code goes through a Pull Request
- PR must pass CI checks before merge
- At least one team member must review the PR
- Delete feature branch after merge

### Protected Branch Settings (GitHub)

Configure both `main` and `develop` with:

- Require pull request before merging
- Require status checks to pass before merging
- Disable force pushes

---

## Commit Message Format

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>: <short description>

Examples:
feat: add CSV invoice upload parser
fix: correct tax rounding on fractional quantities
chore: update sequelize to v6.37
docs: add API route reference to README
test: add unit tests for encryption util
refactor: extract FBR token logic into service
```

**Types:** `feat` | `fix` | `chore` | `docs` | `test` | `refactor` | `style` | `ci`

---

## Pull Request Checklist

Before opening a PR:

- [ ] Code runs locally without errors
- [ ] ESLint passes (`npm run lint`)
- [ ] Tests pass (`npm test`)
- [ ] `.env.example` updated if new env vars added
- [ ] No `console.log` left in production code (use logger)
- [ ] Sensitive data (tokens, passwords) are never logged or returned in responses
- [ ] All new DB queries are scoped by `company_id`

---

## Code Style

- **Backend:** ESLint + Prettier (see `backend/.eslintrc.json`)
- **Frontend:** ESLint + Prettier (see `frontend/.eslintrc.json`)
- Run `npm run format` before committing
- Pre-commit hook enforces lint automatically

---

## Development Setup

See [README.md](./README.md) for full local setup instructions.
