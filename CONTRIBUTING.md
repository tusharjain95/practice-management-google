# Contributing to CA Practice Manager

Thanks for your interest in contributing! This document outlines the process
for getting changes merged.

## Code of Conduct

Be respectful. Be inclusive. Be patient with new contributors.

## Reporting issues

When filing a bug report please include:

- **Summary** of the problem
- **Steps to reproduce** (sequential)
- **Expected behavior** vs **actual behavior**
- Screenshots or curl output if relevant
- Browser/OS/Node version, MongoDB version

## Suggesting features

Open a discussion first if it's a large feature, so we can align on scope
before code is written. Small enhancements can go directly to a PR.

## Pull Request workflow

1. **Fork** and create a feature branch:
   ```bash
   git checkout -b feat/short-description
   ```
2. **Make changes** following the conventions below.
3. **Test** locally:
   - `yarn lint` (no new warnings)
   - Run `yarn dev` and verify the affected flows in the browser
   - For API changes, test with curl or Postman
4. **Commit** with a [Conventional Commit](https://www.conventionalcommits.org/) message:
   ```
   feat(invoices): add CSV import for invoice line items
   fix(auth): handle expired token gracefully
   docs(readme): clarify Docker setup
   refactor(api): extract ledger calculation to helper
   ```
5. **Push** and open a **Pull Request** with:
   - Clear description of the change
   - Screenshots for UI changes
   - Notes about breaking changes (if any)
   - Reference to the issue it closes (`Closes #123`)

## Coding style

### Frontend
- Functional React components with hooks. No class components.
- Use `'use client'` only when necessary (state, effects, browser APIs).
- Tailwind utility classes + shadcn/ui components. Avoid custom CSS unless
  absolutely required.
- Component names in `PascalCase`, files in lowercase with hyphens.
- Keep components < 300 lines; split into smaller pieces when they grow.

### Backend (API routes)
- All endpoints live in `app/api/[[...path]]/route.js` (single catch-all).
- Use **UUIDs** for all IDs — never expose MongoDB `ObjectId`.
- Always project out `_id` in responses (`{ projection: { _id: 0 } }`).
- Wrap handlers in try/catch and return `{ error: '...' }` with appropriate
  HTTP status codes.
- Enforce role checks at the top of each mutating handler.

### Database
- One collection per entity. Schemas are implicit (MongoDB) but document them
  in `README.md` data-model section.
- Use ISO 8601 strings for timestamps (`new Date().toISOString()`), not Date
  objects, for consistent JSON serialization.
- For monetary fields use numbers (rupees as float); round to 2 decimals
  with `+x.toFixed(2)` when storing computed totals.

### Security checklist for new endpoints
- [ ] JWT verified (`verifyAuth(request)`)
- [ ] Role check applied for write operations
- [ ] Staff scoping enforced (if applicable)
- [ ] Input validation on body fields
- [ ] No password hashes / secrets leaked in responses
- [ ] Activity log entry created for the action

## Local development tips

```bash
# Watch backend logs
tail -f .next/build.log

# Wipe local database and re-seed (CAUTION)
docker exec -it ca-mongo mongosh ca_practice --eval 'db.dropDatabase()'
# then refresh the app to re-seed admin/manager/staff users

# Quick API test
curl -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@ca.com","password":"admin123"}'
```

## Release process

Maintainers handle releases. Tagged versions follow [SemVer](https://semver.org/):
- **MAJOR**: breaking API changes
- **MINOR**: new features (backward compatible)
- **PATCH**: bug fixes

Thank you for contributing! 🎉
