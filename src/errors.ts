export class AppError extends Error {
  status: number;
  code: number;
  details?: Record<string, unknown>;

  constructor(status: number, code: number, message: string, details?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
