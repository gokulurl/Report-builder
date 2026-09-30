import { Component, Inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';

/** PRD 7 (Export): a stated reason is required when restricted columns are present; it's stored with the audit record. */
@Component({
  selector: 'app-export-reason-dialog',
  imports: [FormsModule, MatDialogModule],
  template: `
    <div class="fx-dialog" role="dialog" aria-modal="true">
      <div class="fx-dialog-head">Export restricted data</div>
      <div class="fx-dialog-body">
        <p>This report includes restricted columns: <b>{{ data.columns.join(', ') }}</b>. Give a reason for the {{ data.format }} export. It's stored with the audit record.</p>
        <label class="fx-form-field">
          <span>Reason <i>*</i></span>
          <textarea rows="3" [ngModel]="reason()" (ngModelChange)="reason.set($event); touched.set(true)" placeholder="Contact list for the vaccination recall campaign"></textarea>
        </label>
        @if (touched() && reason().trim().length < 5) { <small class="fx-field-error">Enter a reason.</small> }
      </div>
      <div class="fx-dialog-foot">
        <button class="fx-btn fx-btn-primary" (click)="ref.close(reason().trim())" [disabled]="reason().trim().length < 5">Export</button>
        <button class="fx-btn fx-btn-secondary" mat-dialog-close>Cancel</button>
      </div>
    </div>
  `,
})
export class ExportReasonDialog {
  reason = signal('');
  touched = signal(false);
  constructor(@Inject(MAT_DIALOG_DATA) public data: { columns: string[]; format: string }, public ref: MatDialogRef<ExportReasonDialog, string>) {}
}
