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
