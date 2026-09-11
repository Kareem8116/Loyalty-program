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
        className="min-h-screen flex flex-col items-center justify-center p-6 text-center"
        style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
      >
        <div 
          className="max-w-sm w-full p-8 rounded-3xl border shadow-sm"
          style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)' }}
        >
          <div 
            className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center text-3xl font-bold"
            style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-accent)' }}
          >
            !
          </div>
          <h1 className="text-xl font-bold mb-2">رمز العميل غير صحيح</h1>
          <p className="text-sm opacity-70">
            لم يتم العثور على بطاقة ولاء مطابقة لهذا الرمز. يرجى التأكد من مسح الرمز الصحيح.
          </p>
        </div>
      </main>
    );
  }

  return <CustomerScreen customer={customer} />;
}
