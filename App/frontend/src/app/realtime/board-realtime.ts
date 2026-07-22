import { Injectable } from '@angular/core';
import { HubConnectionBuilder, type HubConnection } from '@microsoft/signalr';
import { Subject } from 'rxjs';

/**
 * Path the Board hub is mapped at (F6, ticket #23) — under /api so it inherits the same
 * open-mode/authenticated gating as every other endpoint (see BoardHub's own doc, backend).
 */
const HUB_URL = '/api/hubs/board';

/** Delay before retrying the very first connection attempt (e.g. backend not up yet). */
const FIRST_CONNECT_RETRY_DELAY_MS = 5000;

/**
 * A Task-level real-time event (ticket #23): only the affected Task's id travels — the
 * receiving client re-fetches through the same authenticated `GET` the rest of the UI already
 * uses, which recomputes per-viewer facts (`canDelete`) and the Comment/Attachment counts.
 */
export interface TaskRealtimeEvent {
  taskId: string;
}

/**
 * Connects to the real-time Board hub (F6, ticket #23 — ADR-0001) and republishes its broadcasts
 * as RxJS observables for the Board to subscribe to. Relies entirely on `@microsoft/signalr`'s
 * automatic transport negotiation (WebSocket → Server-Sent Events → long polling) — the ADR
 * forbids forcing a transport, since the portal contract does not document ingress WebSocket
 * support.
 */
@Injectable({ providedIn: 'root' })
export class BoardRealtimeService {
  private readonly connection: HubConnection = new HubConnectionBuilder()
    .withUrl(HUB_URL)
    .withAutomaticReconnect()
    .build();

  private readonly taskCreatedSubject = new Subject<TaskRealtimeEvent>();
  private readonly taskUpdatedSubject = new Subject<TaskRealtimeEvent>();
  private readonly taskMovedSubject = new Subject<TaskRealtimeEvent>();
  private readonly taskDeletedSubject = new Subject<TaskRealtimeEvent>();
  private readonly realignedSubject = new Subject<void>();

  /** A Task was created. */
  readonly taskCreated$ = this.taskCreatedSubject.asObservable();
  /** A Task's title/description/urgency/due date was edited. */
  readonly taskUpdated$ = this.taskUpdatedSubject.asObservable();
  /** A Task moved to another Board column. */
  readonly taskMoved$ = this.taskMovedSubject.asObservable();
  /** A Task was deleted. */
  readonly taskDeleted$ = this.taskDeletedSubject.asObservable();
  /**
   * Emits once the connection is (re)established — first connect and every automatic
   * reconnect: the signal to re-fetch the whole Board, since a change missed while
   * disconnected has no individual event left to replay ("riallineamento alla riconnessione").
   */
  readonly realigned$ = this.realignedSubject.asObservable();

  /** Wires the hub event handlers and starts the connection. */
  constructor() {
    this.connection.on('TaskCreated', (taskId: string) => this.taskCreatedSubject.next({ taskId }));
    this.connection.on('TaskUpdated', (taskId: string) => this.taskUpdatedSubject.next({ taskId }));
    this.connection.on('TaskMoved', (taskId: string) => this.taskMovedSubject.next({ taskId }));
    this.connection.on('TaskDeleted', (taskId: string) => this.taskDeletedSubject.next({ taskId }));
    this.connection.onreconnected(() => this.realignedSubject.next());

    void this.connect();
  }

  /**
   * Starts the connection, retrying by hand on failure: `withAutomaticReconnect()` only takes
   * over once a connection has been established at least once.
   */
  private async connect(): Promise<void> {
    try {
      await this.connection.start();
      this.realignedSubject.next();
    } catch {
      setTimeout(() => void this.connect(), FIRST_CONNECT_RETRY_DELAY_MS);
    }
  }
}
