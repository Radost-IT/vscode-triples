import { analyze } from '../core/analyze';
import type { WorkerRequest, WorkerResponse } from './workerProtocol';

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const { id, request } = event.data;
  analyze(request).then(
    (result) => self.postMessage({ id, result } satisfies WorkerResponse),
    (error: unknown) =>
      self.postMessage({
        id,
        failure: error instanceof Error ? error.message : String(error),
      } satisfies WorkerResponse),
  );
});
