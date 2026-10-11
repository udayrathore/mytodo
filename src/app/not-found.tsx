import Link from "next/link";
export default function NotFound() {
  return (
    <main className="error-page">
      <h1>This page has wandered off.</h1>
      <Link className="button primary" href="/">
        Return to your workspace
      </Link>
    </main>
  );
}
