'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Lock, Mail, ArrowRight, ScanLine, AlertCircle, Store, Loader2 } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { supabase } from '@/lib/supabase';
import { useLocale } from '@/components/LocaleProvider';

export default function CashierLoginPage() {
  const router = useRouter();
  const { t, isRtl } = useLocale();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg(null);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });

      if (error || !data.user) {
        throw new Error(error?.message || t('cashierLogin.loginFailed'));
      }

      const { data: userRole, error: roleError } = await supabase
        .from('user_roles')
        .select('role, business_id, branch_id')
        .eq('user_id', data.user.id)
        .maybeSingle();

      if (roleError) {
        throw new Error(t('admin.roleError'));
      }

      if (!userRole || userRole.role !== 'cashier') {
        await supabase.auth.signOut();
        throw new Error('هذا الحساب ليس لديه صلاحية كاشير.');
      }

      if (userRole.business_id) localStorage.setItem('cashier_business_id', userRole.business_id);
      if (userRole.branch_id) localStorage.setItem('cashier_branch_id', userRole.branch_id);
      localStorage.setItem('cashier_role', userRole.role);

      router.push('/cashier');
    } catch (err: any) {
      setErrorMsg(err.message || t('cashierLogin.loginFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main 
      className="min-h-screen flex flex-col items-center justify-center p-4 selection:bg-purple-500/30 transition-colors"
      style={{ background: 'var(--page-bg-gradient)', color: 'var(--color-text)' }}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-purple-900/10 blur-[120px]" />
        <div className="absolute top-[20%] -right-[10%] w-[40%] h-[40%] rounded-full bg-teal-900/10 blur-[120px]" />
      </div>

      <div className="w-full max-w-md relative z-10">
        <div className="flex justify-between items-center mb-8">
          <Link 
            href="/" 
            className="p-2 rounded-xl border transition-colors"
            style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)', color: 'var(--color-accent)' }}
          >
            <ArrowRight className={`w-5 h-5 ${isRtl ? '' : 'rotate-180'}`} />
          </Link>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </div>

        <div 
          className="backdrop-blur-xl border p-8 rounded-3xl shadow-2xl transition-colors"
          style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
        >
          <div className="text-center mb-8">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-purple-600 to-teal-600 flex items-center justify-center shadow-lg shadow-purple-900/20">
              <ScanLine className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>{t('cashierLogin.title')}</h1>
            <p className="text-sm mt-2" style={{ color: 'var(--color-text-muted)' }}>{t('cashierLogin.subtitle')}</p>
          </div>

          {errorMsg && (
            <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>{t('cashierLogin.email')}</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3.5 w-4 h-4 opacity-50" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border py-3 pl-10 pr-4 rounded-xl text-sm focus:outline-none focus:border-purple-500/50 transition-colors"
                  style={{ backgroundColor: 'var(--color-input-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>{t('cashierLogin.password')}</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3.5 w-4 h-4 opacity-50" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border py-3 pl-10 pr-4 rounded-xl text-sm focus:outline-none focus:border-purple-500/50 transition-colors"
                  style={{ backgroundColor: 'var(--color-input-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full btn-gradient py-3 rounded-xl text-sm font-bold shadow-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-2 mt-4"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : t('cashierLogin.signIn')}
            </button>
          </form>
        </div>

        <footer className="mt-8 text-center text-[#444] text-[11px] flex items-center justify-center gap-1.5">
          <Store className="w-3.5 h-3.5" />
          <span>{t('cashierLogin.footer')}</span>
        </footer>
      </div>
    </main>
  );
}
