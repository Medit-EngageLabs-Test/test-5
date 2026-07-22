import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { CreateTaskRequest, Task, TaskStatus, UpdateTaskRequest } from './task.model';

/** HTTP client for the `/api/tasks` resource. */
@Injectable({ providedIn: 'root' })
export class TasksService {
  readonly #http = inject(HttpClient);
  readonly #base = '/api/tasks';

  /** Lists every Task, already ordered per ADR-0002 (see task.model.ts). */
  list(): Observable<Task[]> {
    return this.#http.get<Task[]>(this.#base);
  }

  /** Creates a Task (ticket #14): Status starts at ToDo, Urgency defaults to Medium server-side. */
  create(request: CreateTaskRequest): Observable<Task> {
    return this.#http.post<Task>(this.#base, request);
  }

  /** Replaces a Task's title/description/urgency/due date (ticket #15) — Status is untouched. */
  update(id: string, request: UpdateTaskRequest): Observable<Task> {
    return this.#http.put<Task>(`${this.#base}/${id}`, request);
  }

  /** Moves a Task to another Board column (ticket #16, drag&drop). */
  updateStatus(id: string, status: TaskStatus): Observable<Task> {
    return this.#http.patch<Task>(`${this.#base}/${id}/status`, { status });
  }
}
