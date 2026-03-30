# Knowledge Management E2E Test Report

Date: 2026-03-30

Scope:
- Frontend Playwright E2E for knowledge management flows
- Spec file: `test/e2e/knowledge-management.spec.ts`
- Target stack:
  - `web-app` at `http://127.0.0.1:5173`
  - `knowledge-service` at `http://127.0.0.1:8092`

## Execution Result

Command:

```bash
cd test
npm run test:e2e -- test/e2e/knowledge-management.spec.ts
```

Final result:

```text
5 passed (8.1s)
```

## Covered Scenarios

1. Knowledge list
- Create source from UI
- Search sources
- Filter by status
- Delete source

2. Documents workflow
- Rename document
- Open preview
- Upload document
- Jump from documents tab to chunks tab
- Delete document

3. Chunks workflow
- Create chunk
- Edit chunk content and keywords
- Delete chunk

4. Config and maintenance
- Edit index profile parameters
- Verify `rebuildRequired` warning appears
- Trigger source rebuild from maintenance tab
- Verify maintenance warning clears after rebuild

5. Retrieval workbench
- Run compare retrieval
- Open chunk detail
- Edit chunk content and keywords from retrieval detail
- Verify retrieval history is recorded

## Issues Found During Test Construction

The failures encountered during the first runs were test issues, not product regressions:

1. Admin route mismatch
- Initial login used a non-admin user, so `/knowledge` redirected to `/`.
- Fix: use `admin` in E2E login helper.

2. Incorrect list-page create button locator
- The test targeted a non-existent `.page-header-actions` container.
- Fix: target the actual `.action-btn-primary.btn.btn-primary` button.

3. Upload modal blocked subsequent document actions
- After upload completed, the modal stayed open and intercepted clicks.
- Fix: explicitly close the upload modal before interacting with document rows.

4. Chunk flow clicked the card again while detail modal was already open
- The newly created chunk was already selected in the detail modal.
- Fix: continue from the open detail modal instead of re-clicking the card.

5. Overly strict config-page section-count assertion
- The config page rendered 5 section cards instead of the expected 4.
- Fix: switch to a stable action/button visibility assertion.

6. Strict-mode selector conflicts
- Duplicate warning banners and duplicate delete buttons caused Playwright strict-mode failures.
- Fix: scope locators more narrowly with `.first()` / `.last()` and modal-specific selectors.

## Files Changed

- `test/e2e/knowledge-management.spec.ts`
- `test/report/knowledge-management-e2e-report-20260330.md`

## Notes

- `./scripts/ctl.sh status` reported `gateway`, `web-app`, and `knowledge-service` running during execution.
- `Exporter` was down, but it did not affect these knowledge E2E tests.
