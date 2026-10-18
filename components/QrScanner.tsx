'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Html5QrcodeScanner, Html5QrcodeScanType } from 'html5-qrcode';
import { Camera, Barcode, Usb, WarningCircle, CircleNotch, Lightning, MagnifyingGlass } from '@phosphor-icons/react';
import { useLocale } from './LocaleProvider';
import { extractCustomerToken } from '@/lib/tokens';

interface QrScannerProps {
  onScan?: (token: string) => void;
  onScanSuccess?: (token: string) => void;
  isLoading?: boolean;
}

export default function QrScanner({ onScan, onScanSuccess, isLoading }: QrScannerProps) {
  const { t, isRtl } = useLocale();
  const [scannerMode, setScannerMode] = useState<'external' | 'camera'>('external');
  const [inputValue, setInputValue] = useState('');
  const [cameraError, setCameraError] = useState<string | null>(null);
  
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const externalInputRef = useRef<HTMLInputElement | null>(null);

  const triggerScan = useCallback((token: string) => {
    const cleanToken = extractCustomerToken(token);
    if (!cleanToken) return;
    if (onScan) onScan(cleanToken);
    if (onScanSuccess) onScanSuccess(cleanToken);
  }, [onScan, onScanSuccess]);

  // Load preferred scanner mode from localStorage
  useEffect(() => {
    try {
      const savedMode = localStorage.getItem('cashier_scanner_mode');
      if (savedMode === 'camera' || savedMode === 'external') {
        setScannerMode(savedMode);
      }
    } catch {
      // Ignore localStorage errors in private browsing
    }
  }, []);

  const handleModeChange = (mode: 'external' | 'camera') => {
    setScannerMode(mode);
    try {
      localStorage.setItem('cashier_scanner_mode', mode);
    } catch {}
  };

  // Auto-focus input when in external scanner mode
  useEffect(() => {
    if (scannerMode === 'external' && !isLoading) {
      const timer = setTimeout(() => {
        externalInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [scannerMode, isLoading]);

  // Global keydown listener for external HID scanner wedge
  // Ensures hardware scanner keystrokes are caught even if focus was clicked away
  useEffect(() => {
    if (scannerMode !== 'external' || isLoading) return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is inside another form control
      const activeEl = document.activeElement;
      if (activeEl && activeEl !== externalInputRef.current && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
        return;
      }

      if (e.key === 'Enter') {
        if (externalInputRef.current && externalInputRef.current.value.trim()) {
          e.preventDefault();
          const val = externalInputRef.current.value.trim();
          setInputValue('');
          triggerScan(val);
        }
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (externalInputRef.current && document.activeElement !== externalInputRef.current) {
          externalInputRef.current.focus();
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [scannerMode, isLoading, triggerScan]);

  // Camera scanner lifecycle
  useEffect(() => {
    if (scannerMode !== 'camera') {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(() => {});
        scannerRef.current = null;
      }
      return;
    }

    try {
      const scanner = new Html5QrcodeScanner(
        'qr-reader',
        {
          fps: 10,
          qrbox: { width: 220, height: 220 },
          supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
          rememberLastUsedCamera: true,
          showTorchButtonIfSupported: true,
        },
        false
      );

      scannerRef.current = scanner;

      scanner.render(
        (decodedText) => {
          triggerScan(decodedText);
        },
        () => {}
      );
    } catch (err: any) {
      console.warn('Camera scanner initialization error:', err);
      setCameraError(t('qrScanner.cameraError'));
    }

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(() => {});
        scannerRef.current = null;
      }
    };
  }, [scannerMode, triggerScan, t]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const val = inputValue.trim();
    setInputValue('');
    triggerScan(val);
  };

  return (
    <div className="w-full flex flex-col items-center">
      {/* Scanner Mode Toggle Tabs */}
      <div 
        className="w-full max-w-xs flex items-center p-1 rounded-[6px] mb-4 border border-[var(--color-border)] bg-[var(--color-card-bg)]"
      >
        <button
          type="button"
          onClick={() => handleModeChange('external')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-[4px] text-[11px] font-mono uppercase tracking-wider transition-colors cursor-pointer ${
            scannerMode === 'external' ? 'bg-[var(--color-accent)] text-white font-semibold' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
          }`}
        >
          <Barcode weight="light" className="w-4 h-4" />
          <span>{t('qrScanner.modeExternal')}</span>
        </button>

        <button
          type="button"
          onClick={() => handleModeChange('camera')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-[4px] text-[11px] font-mono uppercase tracking-wider transition-colors cursor-pointer ${
            scannerMode === 'camera' ? 'bg-[var(--color-accent)] text-white font-semibold' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
          }`}
        >
          <Camera weight="light" className="w-4 h-4" />
          <span>{t('qrScanner.modeCamera')}</span>
        </button>
      </div>

      {/* External Hardware Scanner Mode (USB / Bluetooth HID) */}
      {scannerMode === 'external' && (
        <div 
          className="w-full rounded-[8px] p-6 flex flex-col items-center justify-center relative overflow-hidden min-h-[300px] border border-[var(--color-border)] bg-[var(--color-card-bg)]"
        >
          {/* Status Indicator Badge */}
          <div 
            className="inline-flex items-center gap-2 px-3 py-1 rounded-[4px] text-[10px] font-mono uppercase tracking-wider mb-5 border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-accent)]"
          >
            <span className="w-2 h-2 rounded-[2px] animate-pulse bg-[var(--color-accent)]" />
            <span>{t('qrScanner.externalReady')}</span>
            <span className="opacity-40">|</span>
            <span className="opacity-75">{t('qrScanner.fastScanBadge')}</span>
          </div>

          {/* Scanner Visual Crosshair Icon */}
          <div 
            className="w-20 h-20 rounded-[8px] flex items-center justify-center mb-4 border border-dashed border-[var(--color-accent)]/50 bg-[var(--color-bg)] relative"
          >
            <Barcode weight="light" className="w-10 h-10 text-[var(--color-accent)] opacity-80" />
            <div 
              className="w-full h-px animate-pulse absolute top-1/2 -translate-y-1/2 bg-[var(--color-accent)] opacity-80"
            />
          </div>

          {/* User Hint */}
          <p className="text-xs text-center opacity-75 font-mono max-w-xs mb-6 px-2 leading-relaxed">
            {t('qrScanner.externalHint')}
          </p>

          {/* Form with Auto-Focused High-Speed Input */}
          <form onSubmit={handleSubmit} className="w-full max-w-xs flex flex-col gap-2">
            <div className="relative">
              <input
                ref={externalInputRef}
                type="text"
                id="external-scanner-input"
                autoFocus
                autoComplete="off"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={t('qrScanner.externalPlaceholder')}
                className={`w-full py-2 px-3 rounded-[4px] text-xs font-mono tracking-wider text-center border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-hidden transition-colors ${isRtl ? 'pr-9' : 'pl-9'}`}
              />
              <Usb weight="light" className={`w-4 h-4 absolute top-1/2 -translate-y-1/2 opacity-40 ${isRtl ? 'right-3' : 'left-3'}`} />
            </div>

            <button
              type="submit"
              id="external-submit-btn"
              disabled={!inputValue.trim() || isLoading}
              className="w-full py-2.5 px-4 rounded-[8px] text-xs font-medium uppercase tracking-wider transition-all active:scale-[0.99] disabled:opacity-40 flex items-center justify-center gap-1.5 bg-[var(--color-accent)] text-white hover:brightness-110 cursor-pointer"
            >
              <MagnifyingGlass weight="light" className="w-3.5 h-3.5" />
              <span>{isLoading ? t('common.loading') : t('qrScanner.externalSubmit')}</span>
            </button>
          </form>

          {/* Loading Overlay */}
          {isLoading && (
            <div 
              className="absolute inset-0 bg-[var(--color-overlay-bg)] flex flex-col items-center justify-center z-10 text-[var(--color-btn-text)]"
            >
              <CircleNotch weight="light" className="w-6 h-6 animate-spin mb-2" />
              <span className="text-xs font-mono">{t('common.loading')}</span>
            </div>
          )}
        </div>
      )}

      {/* Device Camera Scanner Mode */}
      {scannerMode === 'camera' && (
        <div className="w-full flex flex-col items-center">
          <div 
            className="w-full rounded-[8px] p-4 flex flex-col items-center justify-center relative overflow-hidden min-h-[280px] border border-[var(--color-border)] bg-[var(--color-card-bg)]"
          >
            <div id="qr-reader" className="w-full max-w-xs overflow-hidden rounded-[4px]" />

            {!cameraError && (
              <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-8">
                <div 
                  className="w-full h-full rounded-[4px] border border-dashed border-[var(--color-accent)] relative overflow-hidden"
                >
                  <div 
                    className="w-full h-px animate-pulse absolute top-1/2 -translate-y-1/2 bg-[var(--color-accent)]"
                  />
                </div>
                <span 
                  className="text-[10px] font-mono uppercase tracking-wider mt-3 px-2.5 py-1 rounded-[4px] border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)]"
                >
                  {t('qrScanner.scannerHeading')}
                </span>
              </div>
            )}

            {cameraError && (
              <div className="p-6 text-center flex flex-col items-center">
                <WarningCircle weight="light" className="w-8 h-8 mb-2 opacity-75 text-[var(--color-accent)]" />
                <p className="text-xs font-mono opacity-80 mb-3">{cameraError}</p>
                <span className="text-xs font-mono uppercase tracking-wider text-[var(--color-accent)]">
                  {t('qrScanner.manualLabel')}
                </span>
              </div>
            )}

            {isLoading && (
              <div 
                className="absolute inset-0 bg-[var(--color-overlay-bg)] flex flex-col items-center justify-center z-10 text-[var(--color-btn-text)]"
              >
                <CircleNotch weight="light" className="w-6 h-6 animate-spin mb-2" />
                <span className="text-xs font-mono">{t('common.loading')}</span>
              </div>
            )}
          </div>

          {/* Manual Input Fallback */}
          <form onSubmit={handleSubmit} className="w-full mt-4">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  id="manual-qr-token-input"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={t('qrScanner.placeholder')}
                  className={`w-full py-2 px-3 rounded-[4px] text-xs font-mono border border-[var(--color-border)] bg-[var(--color-card-bg)] text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-hidden transition-colors ${isRtl ? 'pr-9' : 'pl-9'}`}
                />
                <Usb weight="light" className={`w-4 h-4 absolute top-1/2 -translate-y-1/2 opacity-40 ${isRtl ? 'right-3' : 'left-3'}`} />
              </div>
              <button
                type="submit"
                id="manual-submit-btn"
                disabled={!inputValue.trim() || isLoading}
                className="py-2 px-4 rounded-[8px] text-xs font-mono uppercase tracking-wider transition-all active:scale-[0.99] disabled:opacity-40 shrink-0 bg-[var(--color-accent)] text-white hover:brightness-110 cursor-pointer"
              >
                {t('common.search')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

