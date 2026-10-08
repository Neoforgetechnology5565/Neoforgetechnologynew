import Link from "next/link";
export default function NotFound() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-32 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-600">404</p>
      <h1 className="mt-3 font-display text-4xl font-semibold">Page not found</h1>
      <p className="mt-3 text-stone-500">The page you requested doesn&apos;t exist or has been moved.</p>
      <Link href="/" className="mt-8 inline-block rounded-full bg-stone-900 px-6 py-3 text-sm font-medium text-white hover:bg-blue-600">Back home</Link>
    </div>
  );
}
