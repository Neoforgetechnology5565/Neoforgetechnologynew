import Link from "next/link";
export default function NotFound() {
  return (
    <div className="container-x py-32 text-center">
      <p className="eyebrow">404</p>
      <h1 className="h-display mt-3 text-4xl">Page not found</h1>
      <p className="mt-3 text-paper/60">The page you requested doesn&apos;t exist or has been moved.</p>
      <Link href="/" className="btn-primary mt-8">Back home</Link>
    </div>
  );
}
