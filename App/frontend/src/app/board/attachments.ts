import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Attachment } from './attachment.model';

/** HTTP client for Attachments on a Task (ticket #20). */
@Injectable({ providedIn: 'root' })
export class AttachmentsService {
  readonly #http = inject(HttpClient);

  /** Lists a Task's Attachments — both direct and its Comments' (ticket #21). */
  list(taskId: string): Observable<Attachment[]> {
    return this.#http.get<Attachment[]>(`/api/tasks/${taskId}/attachments`);
  }

  /** Uploads a file directly to a Task (ticket #20) — 400/413 on a rejected file. */
  uploadToTask(taskId: string, file: File): Observable<Attachment> {
    const formData = new FormData();
    formData.append('file', file);
    return this.#http.post<Attachment>(`/api/tasks/${taskId}/attachments`, formData);
  }

  /** URL the backend proxies the raw file content from (ticket #20). */
  downloadUrl(id: string): string {
    return `/api/attachments/${id}/content`;
  }
}
