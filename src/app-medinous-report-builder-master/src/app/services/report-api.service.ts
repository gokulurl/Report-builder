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
  AppUser,
  ReportVersionDto,
  PublicationDto,
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

  // ---- Sharing, versions, publishing, requests (PRD 6.11, 9) ----

  getUsers(): Observable<AppUser[]> {
    return this.http.get<ApiResponse<AppUser[]>>(`${this.base}/users`).pipe(map((r) => r.data));
  }

  getVersions(reportId: string): Observable<ReportVersionDto[]> {
    return this.http.get<ApiResponse<ReportVersionDto[]>>(`${this.base}/saved/${reportId}/versions`).pipe(map((r) => r.data));
  }

  getPublications(): Observable<PublicationDto[]> {
    return this.http.get<ApiResponse<PublicationDto[]>>(`${this.base}/publications`).pipe(map((r) => r.data));
  }

  publish(req: Omit<PublicationDto, 'publicationId' | 'publishedBy' | 'publishedAt'>): Observable<PublicationDto> {
    return this.http.post<ApiResponse<PublicationDto>>(`${this.base}/publications`, req).pipe(map((r) => r.data));
  }

  /** Reversible: the publication is marked removed and an audit record is written. */
  removePublication(id: string): Observable<PublicationDto> {
    return this.http.delete<ApiResponse<PublicationDto>>(`${this.base}/publications/${id}`).pipe(map((r) => r.data));
  }

  restorePublication(id: string): Observable<PublicationDto> {
    return this.http.post<ApiResponse<PublicationDto>>(`${this.base}/publications/${id}/restore`, {}).pipe(map((r) => r.data));
  }

  requestColumn(req: { moduleId: number | null; entityId: number | null; request: string }): Observable<{ reference: string }> {
    return this.http.post<ApiResponse<{ reference: string }>>(`${this.base}/column-requests`, req).pipe(map((r) => r.data));
  }

  /** Stores the reason given for exporting restricted columns (PRD 7, Export). */
  auditExport(req: { reportName: string; format: string; reason: string; columns: string[] }): Observable<{ reference: string }> {
    return this.http.post<ApiResponse<{ reference: string }>>(`${this.base}/audit/export`, req).pipe(map((r) => r.data));
  }
}
