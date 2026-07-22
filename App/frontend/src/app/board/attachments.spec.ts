import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AttachmentsService } from './attachments';

function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  return {
    service: TestBed.inject(AttachmentsService),
    http: TestBed.inject(HttpTestingController),
  };
}

describe('AttachmentsService', () => {
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('list: GET /api/tasks/{taskId}/attachments', () => {
    const { service, http } = setup();

    service.list('t-1').subscribe();

    const request = http.expectOne('/api/tasks/t-1/attachments');
    expect(request.request.method).toBe('GET');
    request.flush([]);
  });

  it('uploadToTask: POST multipart a /api/tasks/{taskId}/attachments (ticket #20)', () => {
    const { service, http } = setup();
    const file = new File(['contenuto'], 'nota.txt', { type: 'text/plain' });

    service.uploadToTask('t-1', file).subscribe();

    const request = http.expectOne('/api/tasks/t-1/attachments');
    expect(request.request.method).toBe('POST');
    expect(request.request.body instanceof FormData).toBe(true);
    expect((request.request.body as FormData).get('file')).toBe(file);
    request.flush({});
  });

  it('uploadToComment: POST multipart a /api/comments/{commentId}/attachments (ticket #21)', () => {
    const { service, http } = setup();
    const file = new File(['contenuto'], 'allegato.pdf', { type: 'application/pdf' });

    service.uploadToComment('c-1', file).subscribe();

    const request = http.expectOne('/api/comments/c-1/attachments');
    expect(request.request.method).toBe('POST');
    expect((request.request.body as FormData).get('file')).toBe(file);
    request.flush({});
  });

  it('downloadUrl: costruisce l’URL di download proxato (ticket #20)', () => {
    const { service } = setup();

    expect(service.downloadUrl('a-1')).toBe('/api/attachments/a-1/content');
  });

  it('remove: DELETE /api/attachments/{id} (ticket #22)', () => {
    const { service, http } = setup();

    service.remove('a-1').subscribe();

    const request = http.expectOne('/api/attachments/a-1');
    expect(request.request.method).toBe('DELETE');
    request.flush(null);
  });
});
