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
        className="w-full max-w-xs flex items-center p-1 rounded-2xl mb-4 border shadow-xs"
        style={{
          backgroundColor: 'var(--color-card-bg)',
          borderColor: 'var(--color-border)',
        }}
      >
        <button
          type="button"
          onClick={() => handleModeChange('external')}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold transition-all"
          style={{
            backgroundColor: scannerMode === 'external' ? 'var(--color-accent)' : 'transparent',
            color: scannerMode === 'external' ? 'var(--color-btn-text)' : 'var(--color-text)',
            opacity: scannerMode === 'external' ? 1 : 0.7,
          }}
        >
          <Barcode weight="light" className="w-4 h-4" />
          <span>{t('qrScanner.modeExternal')}</span>
        </button>

        <button
          type="button"
          onClick={() => handleModeChange('camera')}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold transition-all"
          style={{
            backgroundColor: scannerMode === 'camera' ? 'var(--color-accent)' : 'transparent',
            color: scannerMode === 'camera' ? 'var(--color-btn-text)' : 'var(--color-text)',
            opacity: scannerMode === 'camera' ? 1 : 0.7,
          }}
        >
          <Camera weight="light" className="w-4 h-4" />
          <span>{t('qrScanner.modeCamera')}</span>
        </button>
      </div>

      {/* External Hardware Scanner Mode (USB / Bluetooth HID) */}
      {scannerMode === 'external' && (
        <div 
          className="glass-card w-full rounded-3xl p-6 flex flex-col items-center justify-center relative overflow-hidden min-h-[300px]"
          style={{
            backgroundColor: 'var(--color-card-bg)',
            borderColor: 'var(--color-border)',
          }}
        >
          {/* Status Indicator Badge */}
          <div 
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold mb-5 shadow-xs border"
            style={{
              backgroundColor: 'var(--color-bg)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-accent)',
            }}
          >
            <span className="w-2 h-2 rounded-full animate-ping" style={{ backgroundColor: 'var(--color-accent)' }} />
            <span>{t('qrScanner.externalReady')}</span>
            <span className="text-[10px] opacity-60">|</span>
            <span className="text-[10px] opacity-75">{t('qrScanner.fastScanBadge')}</span>
          </div>

          {/* Scanner Visual Crosshair Icon */}
          <div 
            className="w-24 h-24 rounded-3xl flex items-center justify-center mb-4 border-2 border-dashed relative shadow-inner"
            style={{
              borderColor: 'var(--color-accent)',
              backgroundColor: 'var(--color-bg)',
            }}
          >
            <Barcode weight="light" className="w-12 h-12 animate-pulse" style={{ color: 'var(--color-accent)' }} />
            <div 
              className="w-full h-0.5 animate-pulse absolute top-1/2 -translate-y-1/2 opacity-70"
              style={{ backgroundColor: 'var(--color-accent)' }}
            />
          </div>

          {/* User Hint */}
          <p className="text-xs text-center opacity-80 max-w-xs mb-6 px-2 leading-relaxed">
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
                className={`w-full py-3 px-4 rounded-xl text-sm font-mono font-bold tracking-wider text-center border transition-all focus:outline-hidden focus:ring-2 ${isRtl ? 'pr-10' : 'pl-10'}`}
                style={{
                  backgroundColor: 'var(--color-bg)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text)',
                }}
              />
              <Usb weight="light" className={`w-4 h-4 absolute top-1/2 -translate-y-1/2 opacity-40 ${isRtl ? 'right-3' : 'left-3'}`} />
            </div>

            <button
              type="submit"
              id="external-submit-btn"
              disabled={!inputValue.trim() || isLoading}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-bold transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-xs"
              style={{
                backgroundColor: 'var(--color-accent)',
                color: 'var(--color-btn-text)',
              }}
            >
              <MagnifyingGlass weight="light" className="w-3.5 h-3.5" />
              <span>{isLoading ? t('common.loading') : t('qrScanner.externalSubmit')}</span>
            </button>
          </form>

          {/* Loading Overlay */}
          {isLoading && (
            <div 
              className="absolute inset-0 backdrop-blur-xs flex flex-col items-center justify-center z-10"
              style={{
                backgroundColor: 'var(--color-overlay-bg)',
                color: 'var(--color-btn-text)',
              }}
            >
              <CircleNotch weight="light" className="w-8 h-8 animate-spin mb-2" />
              <span className="text-xs font-medium">{t('common.loading')}</span>
            </div>
          )}
        </div>
      )}

      {/* Device Camera Scanner Mode */}
      {scannerMode === 'camera' && (
        <div className="w-full flex flex-col items-center">
          <div 
            className="glass-card w-full rounded-3xl p-4 flex flex-col items-center justify-center relative overflow-hidden min-h-[280px]"
            style={{
              backgroundColor: 'var(--color-card-bg)',
              borderColor: 'var(--color-border)',
            }}
          >
            <div id="qr-reader" className="w-full max-w-xs overflow-hidden rounded-2xl" />

            {!cameraError && (
              <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-8">
                <div 
                  className="w-full h-full rounded-2xl border-2 border-dashed relative overflow-hidden"
                  style={{ borderColor: 'var(--color-accent)' }}
                >
                  <div 
                    className="w-full h-0.5 animate-pulse absolute top-1/2 -translate-y-1/2"
                    style={{ backgroundColor: 'var(--color-accent)' }}
                  />
                </div>
                <span 
                  className="text-[11px] font-semibold mt-3 px-3 py-1 rounded-full backdrop-blur-sm shadow-xs"
                  style={{
                    backgroundColor: 'var(--color-overlay-bg)',
                    color: 'var(--color-btn-text)',
                  }}
                >
                  {t('qrScanner.scannerHeading')}
                </span>
              </div>
            )}

            {cameraError && (
              <div className="p-6 text-center flex flex-col items-center">
                <WarningCircle weight="light" className="w-10 h-10 mb-2 opacity-70" style={{ color: 'var(--color-accent)' }} />
                <p className="text-xs opacity-80 mb-3">{cameraError}</p>
                <span className="text-xs font-semibold" style={{ color: 'var(--color-accent)' }}>
                  {t('qrScanner.manualLabel')}
                </span>
              </div>
            )}

            {isLoading && (
              <div 
                className="absolute inset-0 backdrop-blur-xs flex flex-col items-center justify-center z-10"
                style={{
                  backgroundColor: 'var(--color-overlay-bg)',
                  color: 'var(--color-btn-text)',
                }}
              >
                <CircleNotch weight="light" className="w-8 h-8 animate-spin mb-2" />
                <span className="text-xs font-medium">{t('common.loading')}</span>
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
                  className={`w-full py-2.5 px-3 rounded-xl text-xs border transition-all focus:outline-hidden focus:ring-1 ${isRtl ? 'pr-9' : 'pl-9'}`}
                  style={{
                    backgroundColor: 'var(--color-card-bg)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text)',
                  }}
                />
                <Usb weight="light" className={`w-4 h-4 absolute top-1/2 -translate-y-1/2 opacity-40 ${isRtl ? 'right-3' : 'left-3'}`} />
              </div>
              <button
                type="submit"
                id="manual-submit-btn"
                disabled={!inputValue.trim() || isLoading}
                className="py-2.5 px-4 rounded-xl text-xs font-bold transition-all active:scale-95 disabled:opacity-50 shrink-0"
                style={{
                  backgroundColor: 'var(--color-accent)',
                  color: 'var(--color-btn-text)',
                }}
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

