# Medinous Report Builder: UI redesign

A UI redesign of the Report Builder POC in the Medinous Fusion HMS shell (the same measured tokens as demo.medinousfusion.com).

## What's here

| Path | What |
|---|---|
| `src/app-medinous-report-builder-master/` | The Angular 21 app: **Reports** (run screen), **My Schedules**, and the redesigned **Report Builder** |
| `run-screen-mockup.html` | The clickable mockup the run screen was reviewed from |
| `NOTES-for-backend.md` | What the .NET API needs to support the new UI (totals, dropdown values, schedules, …) |

## Run it

```bash
cd src/app-medinous-report-builder-master
npm install
npm start -- --port 4320
```

The app runs against a **dev-only mock API** (`src/app/mock/`) with HMS-shaped demo data, so no back end is needed. To use the real .NET API (proxied to `localhost:5276`), remove `withInterceptors([mockApiInterceptor])` in `src/app/app.config.ts`.

## Screens

- **Reports** (`/reports`): full-page list of saved reports. Open one to see its parameters (date range with presets, dropdowns from master data), run it, and export it. Results include a Total row, and exports carry a header block with the parameters used. Long runs continue in the background and notify you in the bell.
- **My Schedules** (`/schedules`): daily, weekly or monthly schedules with a rolling date range, delivered by notification and/or email. Pause, edit, run now, delete.
- **Builder** (`/builder`) and **Load Report** (`/builder?tab=saved`): the report designer, for admins.
