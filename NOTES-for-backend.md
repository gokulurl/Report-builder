# UI → back-end requests (Report Builder redesign)

These come from the UI redesign in `src/app-medinous-report-builder-master`. The UI already has a place for each item; the gaps are in the API or export service.

## 1. Grand-total row in the server exports (PDF, and CSV for large reports)

**What the UI does now:** the results table ends with a *Total* row. Excel always includes it. CSV includes it when the preview holds every row (under 1,000). Both are built in the browser from the preview data.

**What's missing:**
- `ReportExportService` (Puppeteer PDF, server CSV) doesn't add a total row.
- For reports over `MaxPreviewRows` (1,000), the browser only has the first 1,000 rows, so it can't total the full result. Those exports go to the server without totals.

**Rules the UI uses (please match them):**

| Column summary | Total |
|---|---|
| none (plain number column) | SUM |
| COUNT, SUM | SUM of the grouped rows |
| MIN / MAX | overall MIN / MAX |
| AVG | overall average over the ungrouped rows. Averaging the group averages is wrong, which is why the UI shows "—". |
| COUNT DISTINCT | overall distinct count. Group counts overlap, so the UI shows "—". |

**Suggested approach:** run a second aggregate query with the same WHERE / joins and no GROUP BY. Return it as `PreviewResponse.totals: Record<string, number | null>` and render it as the last `<tr>` in the PDF template and the CSV. Once `totals` is returned, the UI will use it instead of adding up the rows itself. This also fixes AVG and COUNT DISTINCT.

## 2. Sharing

The UI no longer offers "Share with other users" and always sends `isShared: false`. The field and the `/saved/shared` endpoint can stay; nothing in the UI calls them.

## 3. Run screen (Reports → open a report)

The UI calls these. The mock in `src/app/mock/` answers them today; the .NET API needs them:

| Call | Purpose |
|---|---|
| `GET /api/v1/reports/fields/{fieldId}/values` → `string[]` | Distinct values for a dropdown parameter. It uses `ReportParameterDto.entityFieldId`, which the builder now lets designers set ("Values from field"). It should respect tenant RLS. The Doctor and Department lists from the master tables, which Thulasiram asked for, come through here. |
| `POST /preview` with an **empty** parameter value | The run form's "All" choice sends `''`. **An empty parameter should drop the filter that references it**, not match empty rows. |

- **Date ranges:** the UI treats two `Date` parameters in a row (e.g. `fromDate`, `toDate`) as a From–To range, and the filter uses `between ['@fromDate','@toDate']`. No DTO change is needed.
- **Background runs:** the UI switches to "still running, we'll notify you" after 3 s and keeps waiting on the same request. For long reports, an async job with SignalR (as in SPEC §7) should post the notification.
- **Access:** the list shows every saved report. Filtering to the reports a user's role may run is still to be designed (see the transcript, 19:12).
- **Cascading lists** (Department → Doctor) are not built. They need a "parent parameter" on `ReportParameterDto`, plus a values call filtered by the parent value.
- **Export header:** Excel and CSV exports now start with the hospital name, report name, parameters used, and generated time. The server PDF should print the same block (see transcript 45:11 and 45:36).

## 4. Schedules (My Schedules, and Schedule on the run page)

The `ReportSchedule` entity exists but has no controller. The UI's contract (`ReportScheduleDto` in `report.models.ts`):

| Call | Purpose |
|---|---|
| `GET /schedules` | The current user's schedules |
| `POST /schedules` | Create `{ reportId, frequency: Daily\|Weekly\|Monthly, time 'HH:mm', dayOfWeek?, dayOfMonth?, dateRange?, parameters, deliverNotification, deliverEmail, emails, format: Excel\|PDF\|CSV, active }` |
| `PUT /schedules/{id}` | Edit, or pause/resume with `{ active }` |
| `DELETE /schedules/{id}` | Delete |
| `POST /schedules/{id}/run` | Run now; returns the updated schedule with `lastRun` and `lastStatus` |

The server computes `nextRun`. `dateRange` is a rolling period (`Previous day`, `Previous 7 days`, `Month to date`, `Previous month`) that the job resolves into the report's two date parameters at run time.

## 5. PRD changes (Fusion Report Builder PRD): what the UI now expects

All of these are optional additions to the existing DTOs, so the current API keeps working.

| Area | Contract | Notes |
|---|---|---|
| Grouping modes (6.5) | `DataConfigurationDto.groupingMode: 'summary' \| 'detail'` | In **detail** mode, return detail rows ordered by the grouped columns first, then the user's sorts. Return `PreviewResponse.groups: [{ key, rowCount, summary, start }]` and `grandTotal`, all computed in **one pass over the whole result** (not the page). Top N in detail mode ranks detail rows, then summarises the survivors. In summary mode it ranks groups. |
| Grand total | `PreviewResponse.grandTotal`, `groupCount` | Worked out over ungrouped rows, so AVG and COUNT DISTINCT come out right. The UI prefers these over its own client-side fallback. |
| Group limits | `{ code: 'TOO_MANY_GROUPS', reference }` as an HTTP 400 | The UI uses **6.5's numbers: 5 levels and 100 groups**. The PRD also says 3 levels / 5 groups (section 7) and 1,000 groups (acceptance criteria), which needs confirming. |
| Collapsed groups | *(not yet)* | The UI collapses and expands groups on the client. The PRD wants a collapsed report to fetch no detail rows, and expanding a group to fetch only that group. That needs a group-rows endpoint. |
| Paging (6.5, 6.8) | client-side today | The UI pages 50 rows at a time and never splits a group; an oversized group is marked "continued". Server paging should follow the same rule. |
| Errors (6.8) | `{ code: 'TOO_MANY_GROUPS' \| 'TIMEOUT' \| …, reference }` | The UI shows the PRD's plain-language message plus the reference, and never raw database text. |
| Operators (6.4) | unchanged values | The UI now offers `notin` (Not In List) and sends **Between as `[a, b]`**. Relative dates add `unit: 'week'` and `offset: -365` days. `RelativeDateResolver` needs `week`, resolved in the hospital time zone. |
| Column flags (6.3) | `ReportField.isRelated`, `isRestricted` | Restricted columns must be **absent** for users without permission. When they're present, exports call `POST /audit/export { reportName, format, reason, columns }`. |
| Entity info (5.1) | `ReportEntity.description`, `rowMeaning` | Shown in the New Report dialog ("One row is a registered patient"). |
| Sharing (6.11) | `CreateSavedReportRequest.sharedWith: string[]`, `SavedReportDto.ownerName`, `sharedWith`, `version` | `GET /users` feeds the share picker. Opening someone else's report is read-only, and Save becomes "Save a Copy". |
| Versions (6.11) | `GET /saved/{id}/versions` → `[{ version, savedAt, savedBy, changeDescription }]` | |
| Publishing (6.11) | `GET/POST /publications`, `DELETE /publications/{id}` (soft, audited), `POST /publications/{id}/restore` | `{ reportId, moduleId, type: 'live' \| 'snapshot', label?, snapshot?: { result, ranWith, runAt } }`. A snapshot label must be unique per module per day, otherwise return `{ code: 'DUPLICATE_LABEL' }`. The Reports screen lists publications per module. |
| Column requests (9) | `POST /column-requests { moduleId, entityId, request }` → `{ reference }` | |
| Exports (6.10) | client-side today | Excel follows 6.10.1 (built with ExcelJS). CSV has a Row Type column (Detail / Subtotal / Grand total). The **PDF** block (hospital, title, run time, user, filters, parameters, page numbers, summary rows kept with their group) is still server-side. |
| Formats (6.3) | pattern `c2` | Currency and dates follow hospital settings (KD, 3 decimals; "29 Sep 2026"), in `shared/hospital-settings.ts` for now. |
