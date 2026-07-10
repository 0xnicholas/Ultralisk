All changes committed successfully. Let me provide the structured acceptance report.

---

Implemented stub API endpoints for Endpoints, Batch Jobs, and Sessions, with mock fixtures, CRUD route handlers, and verification.

**Changed files:**
- `packages/console-api/src/fixtures.ts` — appended `MOCK_ENDPOINTS` (3 items), `MOCK_BATCH_JOBS` (4 items), `MOCK_SESSIONS` (2 items)
- `packages/console-api/src/index.ts` — added imports for new fixtures, added 11 route handlers (Endpoints: GET list, GET by ID, POST, PATCH, DELETE; Batch Jobs: GET list, GET by ID, POST, DELETE; Sessions: GET list, POST, PATCH, DELETE)

**Validation:** All endpoints tested and returning correct data (list counts, detail names, CRUD operations all 2xx/204).

**Open risks/questions:** None.

**Recommended next step:** Proceed to Tasks consuming these endpoints from the console-ui frontend.