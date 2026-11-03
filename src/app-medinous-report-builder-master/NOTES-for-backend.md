
## 10. Stories doc round (RB-A1..A10, RB-B1..B13)

- **Summary report (RB-B6):** MyReport gains `view: 'detail'|'summary'` and `mhidden: string[]` (figures the user hid). A summary always has a grouping (falls back to Invoice Date by day). One row per group, plus subtotals and a grand total.
- **Totals only:** a template with `show.detail = false` is locked to summary. Staff see "Summary report only".
- **Date buckets:** the catalogue adds Invoice Date by day, week and month (`bucket` on the column). These can be grouped but not totalled.
- **Join columns (RB-A6):** a calc column with `op: 'join'` plus `sep` joins two text columns. It can only be counted, and it cannot be used in formulas.
- **Highlight rules:** the operator depends on the column type: text uses is, is not or contains; numbers use more than, less than or equals; dates use before or after. `applies` is lines, total rows or both.
- **Extra summary tabs removed:** the Summary report replaces them. Any existing `t.summaries` are ignored by the UI.
- **Restriction:** read-only in the builder; editing comes in phase 2.
- The saved date format `short` now reads as `medium`, because dd/mm and mm/dd are ambiguous.
