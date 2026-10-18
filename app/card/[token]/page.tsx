import { notFound } from 'next/navigation';
import { getCustomerByQrToken } from '@/lib/customer';
import CustomerScreen from '@/components/CustomerScreen';

interface CardPageProps {
  params: Promise<{ token: string }>;
}

export default async function CardPage({ params }: CardPageProps) {
  const { token } = await params;

  if (!token) {
    notFound();
  }

  const customer = await getCustomerByQrToken(token);

  if (!customer) {
    return (
      <main 
        className="min-h-screen flex flex-col items-center justify-center p-6 text-center page-bg"
      >
        <div 
          className="max-w-sm w-full p-8 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-card-bg)] text-[var(--color-text)]"
        >
          <div 
            className="w-12 h-12 mx-auto mb-4 rounded-[4px] border border-[var(--color-border)] bg-[var(--color-input-bg)] flex items-center justify-center text-xl font-mono text-[var(--color-signal-blue)] dark:text-[var(--color-arc-cyan)]"
          >
            !
          </div>
          <h1 className="text-lg font-light tracking-tight mb-2 text-[var(--color-text)]">رمز العميل غير صحيح</h1>
          <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
            لم يتم العثور على بطاقة ولاء مطابقة لهذا الرمز. يرجى التأكد من مسح الرمز الصحيح.
          </p>
        </div>
      </main>
    );
  }

  return <CustomerScreen customer={customer} />;
}
