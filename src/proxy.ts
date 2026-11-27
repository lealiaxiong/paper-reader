import { NextResponse, type NextRequest } from "next/server";
import { parseSourceRoute } from "@/lib/sources";

function readRouteSegments(pathname: string): string[] | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "read" || parts.length < 3) return null;

  try {
    return parts.slice(1).map(decodeURIComponent);
  } catch {
    return null;
  }
}

export function proxy(request: NextRequest) {
  const segments = readRouteSegments(request.nextUrl.pathname);
  const ref = segments
    ? parseSourceRoute(segments[0], segments.slice(1))
    : null;

  if (!ref) {
    return NextResponse.rewrite(new URL("/paper-not-found", request.url), {
      status: 404,
    });
  }

  const response = NextResponse.next();
  if (request.nextUrl.searchParams.has("h")) {
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    response.headers.set("Cache-Control", "private, no-store");
  }
  return response;
}

export const config = {
  matcher: ["/read/:path*"],
};
