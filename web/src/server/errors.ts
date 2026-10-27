import { ZodError } from "zod";

export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = "error",
    public readonly details?: unknown,
  ) {
    super(message);
  }
}
export const unauthorized = (msg = "Sign in to continue.") => new AppError(401, msg, "unauthorized");
export const forbidden = (msg = "You don't have permission to do that.") => new AppError(403, msg, "forbidden");
export const notFound = (msg = "Not found.") => new AppError(404, msg, "not_found");
export const conflict = (msg: string, details?: unknown) => new AppError(409, msg, "conflict", details);
export const invalid = (msg: string, details?: unknown) => new AppError(400, msg, "invalid", details);

/** Turns any thrown value into a safe { status, message } for API responses. */
export function toPublicError(e: unknown): { status: number; message: string; code: string; details?: unknown } {
  if (e instanceof AppError) return { status: e.status, message: e.message, code: e.code, details: e.details };
  if (e instanceof ZodError) {
    const first = e.issues[0];
    return { status: 400, code: "invalid", message: first ? `${first.path.join(".") || "input"}: ${first.message}` : "Invalid input.", details: e.issues.slice(0, 10) };
  }
  console.error(e);
  return { status: 500, code: "server_error", message: "Something went wrong on the server." };
}
