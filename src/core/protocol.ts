import type { AnalysisRequest } from './analyze';

export type ViewMode = 'graph' | 'hierarchy';

/** Messages from the extension host to the webview. */
export type HostMessage = {
  readonly type: 'analyze';
  readonly request: AnalysisRequest;
  readonly viewMode: ViewMode;
};

/** Messages from the webview to the extension host. */
export type WebviewMessage =
  | { readonly type: 'ready' }
  | {
      readonly type: 'revealLine';
      readonly uri: string;
      readonly line: number;
      readonly column?: number;
    }
  | { readonly type: 'viewMode'; readonly mode: ViewMode }
  | {
      readonly type: 'export';
      readonly format: 'svg' | 'png';
      readonly data: string;
      readonly suggestedName: string;
    };
