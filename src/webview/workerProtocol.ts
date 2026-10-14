import type { AnalysisRequest, AnalysisResult } from '../core/analyze';

export interface WorkerRequest {
  readonly id: number;
  readonly request: AnalysisRequest;
}

export type WorkerResponse =
  | { readonly id: number; readonly result: AnalysisResult }
  | { readonly id: number; readonly failure: string };
