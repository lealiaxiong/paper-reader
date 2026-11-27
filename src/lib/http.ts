import { NextResponse } from "next/server";

/** Typed error envelope shared by BYOM routes. */
export function apiError(
  status: number,
  code: string,
  message: string,
  details?: unknown,
  headers?: Record<string, string>,
): NextResponse {
  return NextResponse.json(
    { error: { code, message, ...(details === undefined ? {} : { details }) } },
    { status, ...(headers ? { headers } : {}) },
  );
}
