'use client';

import { useEffect, useState } from 'react';
import { Sun, Moon } from '@phosphor-icons/react';

export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    // Explicit class assignment logic
    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
      setIsDark(true);
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      setIsDark(false);
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = !isDark;
    setIsDark(newTheme);
    if (newTheme) {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  if (!mounted) {
    return (
      <div 
        className="w-9 h-9 rounded-[8px] flex items-center justify-center opacity-0"
        aria-hidden="true"
      />
    );
  }

  return (
    <button
      onClick={toggleTheme}
      id="theme-toggle-btn"
      aria-label="Toggle Light/Dark Theme"
      className="w-9 h-9 rounded-[8px] flex items-center justify-center transition-all active:scale-95 hover:border-[var(--color-signal-blue)] cursor-pointer"
      style={{
        backgroundColor: 'var(--color-card-bg)',
        color: 'var(--color-text)',
        border: '1px solid var(--color-border)',
      }}
    >
      {isDark ? <Sun size={18} weight="light" /> : <Moon size={18} weight="light" />}
    </button>
  );
}
