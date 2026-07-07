import Link from "next/link";
import { Shield } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-ink-50 flex items-center justify-center px-4 sm:px-6">
      <div className="text-center">
        <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <Shield className="w-8 h-8 text-blue-400" />
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-ink-900 mb-3">404</h1>
        <p className="text-ink-500 mb-8">Page not found.</p>
        <div className="flex flex-col xs:flex-row gap-3 justify-center">
          <Link href="/" className="btn-secondary">
            Go home
          </Link>
          <Link href="/dashboard" className="btn-primary">
            Open app
          </Link>
        </div>
      </div>
    </div>
  );
}
