"use client";
export default function SentryAcceptance() {
  return <main><h1>Staging monitoring acceptance</h1>
    <button onClick={() => { throw new Error("Synthetic browser acceptance"); }}>Test browser error</button>
    <p><a href="/api/sentry-acceptance">Test server error</a></p>
    <p><a href="/api/admin/sentry-acceptance">Test proxy error</a></p>
  </main>;
}
