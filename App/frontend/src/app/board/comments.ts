import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Comment, CreateCommentRequest, UpdateCommentRequest } from './comment.model';

/** HTTP client for a Task's `/api/tasks/{taskId}/comments` conversation and `/api/comments/{id}`. */
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

  /** Edits a Comment's body (ticket #19) — 403 when the caller is not its author. */
  update(id: string, request: UpdateCommentRequest): Observable<Comment> {
    return this.#http.put<Comment>(`/api/comments/${id}`, request);
  }

  /** Deletes a Comment (ticket #19) — 403 when the caller is neither its author nor a Moderator. */
  remove(id: string): Observable<void> {
    return this.#http.delete<void>(`/api/comments/${id}`);
  }
}
