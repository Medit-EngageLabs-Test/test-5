import { Injectable, signal } from '@angular/core';
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

/** A Comment-level real-time event (ticket #24): the owning Task's id plus the Comment's own. */
export interface CommentRealtimeEvent {
  taskId: string;
  commentId: string;
}

/** An Attachment-level real-time event (ticket #24): the owning Task's id plus the Attachment's own. */
export interface AttachmentRealtimeEvent {
  taskId: string;
  attachmentId: string;
}

/**
 * Connects to the real-time Board hub (F6, ticket #23 — ADR-0001) and republishes its broadcasts
 * as RxJS observables for the Board and the Task detail panel to subscribe to. Relies entirely on
 * `@microsoft/signalr`'s automatic transport negotiation (WebSocket → Server-Sent Events → long
 * polling) — the ADR forbids forcing a transport, since the portal contract does not document
 * ingress WebSocket support.
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
  private readonly commentAddedSubject = new Subject<CommentRealtimeEvent>();
  private readonly commentUpdatedSubject = new Subject<CommentRealtimeEvent>();
  private readonly commentDeletedSubject = new Subject<CommentRealtimeEvent>();
  private readonly attachmentAddedSubject = new Subject<AttachmentRealtimeEvent>();
  private readonly attachmentRemovedSubject = new Subject<AttachmentRealtimeEvent>();
  private readonly realignedSubject = new Subject<void>();
  private readonly connectedSignal = signal(false);

  /**
   * True once the hub connection has been established at least once. Exposed as a signal (not
   * just an event) so a consumer can gate an action on the current state, not only future
   * transitions — the Board uses it (with its own quiescent-refresh state) to expose a
   * `data-realtime-quiescent` host attribute the two-client E2E waits on before dragging: without
   * it, a slow first connect can fire `realigned$`'s refresh mid-gesture, on the exact same list
   * CDK is tracking.
   */
  readonly connected = this.connectedSignal.asReadonly();

  /** A Task was created. */
  readonly taskCreated$ = this.taskCreatedSubject.asObservable();
  /** A Task's title/description/urgency/due date was edited. */
  readonly taskUpdated$ = this.taskUpdatedSubject.asObservable();
  /** A Task moved to another Board column. */
  readonly taskMoved$ = this.taskMovedSubject.asObservable();
  /** A Task was deleted. */
  readonly taskDeleted$ = this.taskDeletedSubject.asObservable();
  /** A Comment was added to a Task's conversation. */
  readonly commentAdded$ = this.commentAddedSubject.asObservable();
  /** A Comment's body was edited. */
  readonly commentUpdated$ = this.commentUpdatedSubject.asObservable();
  /** A Comment was deleted. */
  readonly commentDeleted$ = this.commentDeletedSubject.asObservable();
  /** An Attachment was uploaded to a Task or one of its Comments. */
  readonly attachmentAdded$ = this.attachmentAddedSubject.asObservable();
  /** An Attachment was removed. */
  readonly attachmentRemoved$ = this.attachmentRemovedSubject.asObservable();
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
    this.connection.on('CommentAdded', (taskId: string, commentId: string) =>
      this.commentAddedSubject.next({ taskId, commentId }),
    );
    this.connection.on('CommentUpdated', (taskId: string, commentId: string) =>
      this.commentUpdatedSubject.next({ taskId, commentId }),
    );
    this.connection.on('CommentDeleted', (taskId: string, commentId: string) =>
      this.commentDeletedSubject.next({ taskId, commentId }),
    );
    this.connection.on('AttachmentAdded', (taskId: string, attachmentId: string) =>
      this.attachmentAddedSubject.next({ taskId, attachmentId }),
    );
    this.connection.on('AttachmentRemoved', (taskId: string, attachmentId: string) =>
      this.attachmentRemovedSubject.next({ taskId, attachmentId }),
    );
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
      this.connectedSignal.set(true);
      this.realignedSubject.next();
    } catch {
      setTimeout(() => void this.connect(), FIRST_CONNECT_RETRY_DELAY_MS);
    }
  }
}
