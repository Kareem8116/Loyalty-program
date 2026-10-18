import Link from 'next/link';

export const metadata = {
  title: 'Business Unavailable — Pointat',
  description: 'This business is temporarily unavailable.',
};

export default function BusinessDisabledPage() {
  return (
    <main className="page-bg min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <div className="w-full max-w-sm p-6 sm:p-8 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-card-bg)] text-[var(--color-text)] flex flex-col items-center gap-4">
        {/* Icon */}
        <div
          className="w-12 h-12 rounded-[4px] border border-[var(--color-border)] bg-[var(--color-input-bg)] flex items-center justify-center text-xl text-[var(--color-signal-blue)] dark:text-[var(--color-arc-cyan)]"
        >
          🔒
        </div>

        {/* Heading */}
        <div>
          <h1 className="text-xl font-light tracking-tight text-[var(--color-text)] mb-2">
            هذا المكان غير متاح حالياً
          </h1>
          <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
            This business has been temporarily disabled by the platform administrator. Please contact your business owner for more information.
          </p>
        </div>

        {/* Divider */}
        <div className="w-10 h-[1px] bg-[var(--color-border)] my-1" />

        {/* Back Link */}
        <Link
          href="/"
          className="h-10 px-5 rounded-[8px] font-mono text-xs uppercase tracking-wider font-semibold text-white bg-[var(--color-accent)] hover:opacity-95 transition-opacity inline-flex items-center gap-2"
        >
          ← الصفحة الرئيسية
        </Link>
      </div>
    </main>
  );
}
