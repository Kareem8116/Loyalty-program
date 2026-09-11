import Link from 'next/link';

export const metadata = {
  title: 'Business Unavailable — Pointat',
  description: 'This business is temporarily unavailable.',
};

export default function BusinessDisabledPage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        background: 'var(--color-bg, #FAF7F2)',
        fontFamily: 'Inter, sans-serif',
        textAlign: 'center',
        gap: '1.5rem',
      }}
    >
      {/* Icon */}
      <div
        style={{
          width: '72px',
          height: '72px',
          borderRadius: '50%',
          background: 'rgba(176,137,104,0.12)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '2rem',
        }}
      >
        🔒
      </div>

      {/* Heading */}
      <div>
        <h1
          style={{
            fontSize: '1.5rem',
            fontWeight: 700,
            color: 'var(--color-text, #1a1a1a)',
            margin: 0,
          }}
        >
          هذا المكان غير متاح حالياً
        </h1>
        <p
          style={{
            marginTop: '0.5rem',
            fontSize: '0.95rem',
            color: 'var(--color-text, #1a1a1a)',
            opacity: 0.65,
            maxWidth: '360px',
          }}
        >
          This business has been temporarily disabled by the platform administrator. Please contact your business owner for more information.
        </p>
      </div>

      {/* Divider */}
      <div
        style={{
          width: '40px',
          height: '2px',
          borderRadius: '2px',
          background: 'var(--color-accent, #B08968)',
          opacity: 0.4,
        }}
      />

      {/* Back Link */}
      <Link
        href="/"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.4rem',
          padding: '0.65rem 1.4rem',
          borderRadius: '9999px',
          background: 'var(--color-accent, #B08968)',
          color: '#fff',
          fontWeight: 600,
          fontSize: '0.875rem',
          textDecoration: 'none',
          boxShadow: '0 2px 8px rgba(176,137,104,0.25)',
        }}
      >
        ← الصفحة الرئيسية
      </Link>
    </div>
  );
}
