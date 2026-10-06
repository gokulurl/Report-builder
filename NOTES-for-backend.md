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

## 6. Updated PRD + review round: what the UI now expects

- **Joins removed.** Data sets are report-shaped; related data arrives pre-resolved to one value per row (5.2). `relatedEntities` is no longer sent.
- **Column metadata:** every column needs `description`, `allowedAggregations` (only what makes sense: Age → Avg/Min/Max, never Sum) and, for numbers, `numberKind: money | integer | decimal`. The builder offers formats from `numberKind` (currency only for money, whole numbers only for integers).
- **Summaries need a grouping.** When the last grouping is removed, the UI clears every aggregate. Labels: Total, Average, Count, Count Distinct, Minimum, Maximum.
- **`dataConfiguration` new fields:** `showGrandTotal` (default true), `groupsStart: auto | expanded | collapsed` (detail mode), `calculatedColumns[]`.
- **Calculated columns (7.3):** `{ name, left, operation, right, decimals, formatPattern?, aggregate? }`, where an operand is `{kind:'column',fieldId}`, `{kind:'calc',name}` or `{kind:'value',value}`. Operations: add, subtract, multiply, divide, percentOf (a/b, a fraction), percentDiff ((a−b)/b). Limits: up to 5 columns, 3 levels of chaining, no circular references, and an operand can only use earlier calculated columns. An empty operand or division by zero gives an empty cell. **Divide and percent operations are recalculated from the operand totals** at every subtotal and at the grand total, never added up. The others use their `aggregate` (default Sum). The output column name is `name`, the row key is `calc:<name>`, and the display pattern is `formatPattern`, else `p{decimals}` for percents or `n{decimals}`.
- **Layout saved per report (7.2):** `columnLayout: { widths: {label: px}, nowrap: [labels], pinned: [≤2 labels] }`. Hiding a column and Find are view-only and never saved.
- **Group limit:** 1,000 groups (was 100); beyond that, return `TOO_MANY_GROUPS`.
- **PDF page fit (7.4.3):** the builder estimates widths at 22mm for numbers and dates, 20mm for codes, 25mm for short text and 40mm for names, against 180mm portrait or 267mm landscape. It warns but doesn't block; the server PDF should shrink the text rather than cut columns.

## 7. Two-role model (replaces the single builder; sections 1–6 describe the earlier build)

The UI now follows the manager's prototype. Code: `src/app/rb/` (`engine.ts` holds every rule below; `store.ts` holds state). Sample data stands in for the API.

- **Roles.** IT administrators (`/it`) build and publish **templates**. Staff (`/reports`) run them. Criteria (`/run/:kind/:id`) and result (`/result/:id`) screens are shared.
- **Template = shape only:** `cols, fmt, groups (≤3), sums, show {detail, sub, grand}, start, sorts (≤3), calcs, display {mode, type, label, values, orient}, rules, drill [{col, target}], widths/wrap/pins, scope (fixed "in" restrictions staff cannot remove), summaries (extra summary tabs), expiry (minutes), places (modules), status, removed, heavy`. A template has **no period**.
- **Data set settings (set once per data set, not per template):** `periodCol`, `noun`, `defaultPeriod`, `maxInteractiveDays` (366), and row `actions`.
- **A run = template + criteria** `{period, conds, hidden, sorts}`. The effective filter is: scope, then the period on `periodCol`, then the staff's conditions. Staff may hide any column except those that are grouped, summarised, used in a formula or used for drill-through.
- **Results are cached** by `[templateId, period, conds, hidden, sorts]` for the template's `expiry`. Running the same values again inside that window returns the same result (the UI says so). A result can be **kept** for 7/30/90 days.
- **Background runs:** heavy templates, and periods longer than `maxInteractiveDays`, go to the background. The UI notifies in-app, and by email link if asked. Cancelling is allowed.
- **Result tools never re-query:** sort, row filters, anchored columns (≤2), widths, wrap, density, summary tabs, find, saved named views (one can be the default). Row actions apply to selected lines; "single" actions need lines from one invoice.
- **My versions:** saved criteria per person, with sharing `private | people | module`. A schedule always runs a saved version. Scheduling from the criteria screen saves the on-screen values first.
- **Formula columns:** add, sub, mul, div, pct. Divide and percent are recalculated from totals on subtotal and grand-total rows.
- **Restricted columns** (Mobile): exporting asks for a reason, which is recorded.
- **Grouping limit:** more than 1,000 groups is refused with a message.
