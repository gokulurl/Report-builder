import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import {
  ApiResponse,
  ReportModule,
  ReportEntity,
  ReportField,
  ReportRelationship,
  ReportConfigurationDto,
  PreviewResponse,
  SavedReportDto,
  SavedReportDetailDto,
  CreateSavedReportRequest,
  UpdateSavedReportRequest,
  ReportScheduleDto,
  SaveScheduleRequest,
} from '../models/report.models';

@Injectable({ providedIn: 'root' })
export class ReportApiService {
  private readonly base = '/api/v1/reports';

  constructor(private http: HttpClient) {}

  getModules(): Observable<ReportModule[]> {
    return this.http
      .get<ApiResponse<ReportModule[]>>(`${this.base}/modules`)
      .pipe(map((r) => r.data));
  }

  getEntities(moduleId: number): Observable<ReportEntity[]> {
    return this.http
      .get<ApiResponse<ReportEntity[]>>(`${this.base}/modules/${moduleId}/entities`)
      .pipe(map((r) => r.data));
  }

  getFields(entityId: number): Observable<ReportField[]> {
    return this.http
      .get<ApiResponse<ReportField[]>>(`${this.base}/entities/${entityId}/fields`)
      .pipe(map((r) => r.data));
  }

  getRelationships(entityId: number): Observable<ReportRelationship[]> {
    return this.http
      .get<ApiResponse<ReportRelationship[]>>(`${this.base}/entities/${entityId}/relationships`)
      .pipe(map((r) => r.data));
  }

  preview(config: ReportConfigurationDto): Observable<ApiResponse<PreviewResponse>> {
    return this.http.post<ApiResponse<PreviewResponse>>(`${this.base}/preview`, config);
  }

  exportFile(config: ReportConfigurationDto, format: string): Observable<Blob> {
    return this.http.post(`${this.base}/export/${format}`, config, {
      responseType: 'blob',
    });
  }

  getSavedReports(): Observable<SavedReportDto[]> {
    return this.http
      .get<ApiResponse<SavedReportDto[]>>(`${this.base}/saved`)
      .pipe(map((r) => r.data));
  }

  getSavedReport(reportId: string): Observable<SavedReportDetailDto> {
    return this.http
      .get<ApiResponse<SavedReportDetailDto>>(`${this.base}/saved/${reportId}`)
      .pipe(map((r) => r.data));
  }

  createReport(request: CreateSavedReportRequest): Observable<SavedReportDetailDto> {
    return this.http
      .post<ApiResponse<SavedReportDetailDto>>(`${this.base}/saved`, request)
      .pipe(map((r) => r.data));
  }

  updateReport(reportId: string, request: UpdateSavedReportRequest): Observable<SavedReportDetailDto> {
    return this.http
      .put<ApiResponse<SavedReportDetailDto>>(`${this.base}/saved/${reportId}`, request)
      .pipe(map((r) => r.data));
  }

  deleteReport(reportId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/saved/${reportId}`);
  }

  getTemplates(): Observable<SavedReportDto[]> {
    return this.http
      .get<ApiResponse<SavedReportDto[]>>(`${this.base}/templates`)
      .pipe(map((r) => r.data));
  }

  cloneFromTemplate(reportId: string): Observable<SavedReportDetailDto> {
    return this.http
      .post<ApiResponse<SavedReportDetailDto>>(`${this.base}/saved/${reportId}/use-as-template`, {})
      .pipe(map((r) => r.data));
  }

  // ---- Run screen & scheduling ----

  /** Distinct values of a field, for list-type parameters (Department, Doctor, …). */
  getFieldValues(fieldId: number): Observable<string[]> {
    return this.http.get<ApiResponse<string[]>>(`${this.base}/fields/${fieldId}/values`).pipe(map((r) => r.data));
  }

  getSchedules(): Observable<ReportScheduleDto[]> {
    return this.http.get<ApiResponse<ReportScheduleDto[]>>(`${this.base}/schedules`).pipe(map((r) => r.data));
  }

  createSchedule(req: SaveScheduleRequest): Observable<ReportScheduleDto> {
    return this.http.post<ApiResponse<ReportScheduleDto>>(`${this.base}/schedules`, req).pipe(map((r) => r.data));
  }

  updateSchedule(id: string, req: Partial<SaveScheduleRequest>): Observable<ReportScheduleDto> {
    return this.http.put<ApiResponse<ReportScheduleDto>>(`${this.base}/schedules/${id}`, req).pipe(map((r) => r.data));
  }

  deleteSchedule(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/schedules/${id}`);
  }

  runScheduleNow(id: string): Observable<ReportScheduleDto> {
    return this.http.post<ApiResponse<ReportScheduleDto>>(`${this.base}/schedules/${id}/run`, {}).pipe(map((r) => r.data));
  }
}
