import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Comment, CreateCommentRequest } from './comment.model';

/** HTTP client for a Task's `/api/tasks/{taskId}/comments` conversation. */
@Injectable({ providedIn: 'root' })
export class CommentsService {
  readonly #http = inject(HttpClient);

  /** Lists a Task's Comments, already ordered chronologically by the server. */
  list(taskId: string): Observable<Comment[]> {
    return this.#http.get<Comment[]>(`/api/tasks/${taskId}/comments`);
  }

  /** Writes a Comment (ticket #18): the author is always the current User, server-side. */
  create(taskId: string, request: CreateCommentRequest): Observable<Comment> {
    return this.#http.post<Comment>(`/api/tasks/${taskId}/comments`, request);
  }
}
