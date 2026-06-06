import { NextRequest, NextResponse } from 'next/server';

// Broader allowlist for Adsterra script domains
const ALLOWED = [
  'effectivecpmnetwork.com',
  'highperformanceformat.com',
];

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');
  
  if (!url) {
    return new NextResponse('Missing url param', { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return new NextResponse('Invalid URL', { status: 400 });
  }

  // Check if hostname ends with any allowed domain
  const host = parsed.hostname.toLowerCase();
  const allowed = ALLOWED.some(d => host === d || host.endsWith('.' + d));
  
  if (!allowed) {
    return new NextResponse('Domain not allowed: ' + host, { status: 403 });
  }

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://vibecoderpro.vercel.app/',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (!res.ok) {
      return new NextResponse('Upstream error: ' + res.status, { status: res.status });
    }

    const body = await res.text();
    
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (e: any) {
    return new NextResponse('Proxy error: ' + e.message, { status: 500 });
  }
}
