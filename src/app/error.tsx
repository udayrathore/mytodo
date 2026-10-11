"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="error-page">
      <h1>A moment to reconnect.</h1>
      <p>
        The workspace couldn’t reach its database. Check the connection and try
        again.
      </p>
      <button className="button primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
