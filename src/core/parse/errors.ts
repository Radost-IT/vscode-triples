export class ParseError extends Error {
  override readonly name = 'ParseError';

  constructor(
    message: string,
    readonly line?: number,
    readonly column?: number,
  ) {
    super(message);
  }
}

export class UnsupportedFormatError extends Error {
  override readonly name = 'UnsupportedFormatError';
}
