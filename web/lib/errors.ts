/**
 * Shared error type + API error handler.
 *
 * Port of app/server.py `api_errors`: a ValidationError (the analogue of Python's
 * ValueError for user-facing validation) becomes a 400 with its message; anything
 * else is logged and returns a generic 500 so internals never leak to the client.
 * Response shape stays { error: string }.
 */
import { NextResponse } from 'next/server';

/** User-facing validation failure → HTTP 400. The analogue of Python's ValueError. */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/** Map a thrown error to the JSON response the API contract expects. */
export function errorResponse(err: unknown): NextResponse {
  if (err instanceof ValidationError) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  // Internals never leak — log server-side, return a generic message.
  console.error('Unhandled error in API route:', err);
  return NextResponse.json(
    { error: 'Internal server error — check the server logs.' },
    { status: 500 },
  );
}

/**
 * Wrap an async route handler so a ValidationError → 400 and anything else → 500,
 * mirroring the Flask `api_errors` decorator. Usage:
 *   export const POST = withApiErrors(async (req) => { ... return NextResponse.json(...) })
 */
export function withApiErrors<A extends unknown[]>(
  fn: (...args: A) => Promise<NextResponse>,
): (...args: A) => Promise<NextResponse> {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (err) {
      return errorResponse(err);
    }
  };
}
