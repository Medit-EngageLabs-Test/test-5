import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Task } from './task.model';

/** HTTP client for the `/api/tasks` resource. */
@Injectable({ providedIn: 'root' })
export class TasksService {
  readonly #http = inject(HttpClient);
  readonly #base = '/api/tasks';

  /** Lists every Task, already ordered per ADR-0002 (see task.model.ts). */
  list(): Observable<Task[]> {
    return this.#http.get<Task[]>(this.#base);
  }
}
