'use client';

import { useEffect, useRef } from 'react';
import { createGlonniSupabaseBridge } from '@/lib/glonniSupabaseBridge';

export default function GlonniApp() {
  const loaded = useRef(false);

  useEffect(() => {
    // Prevent double-load in dev mode (React strict mode)
    if (loaded.current) return;
    loaded.current = true;

    // Expose Supabase bridge for the legacy script.
    window.__glonniSupabaseBridge = createGlonniSupabaseBridge();
    window.__glonniSupabaseUrl = window.__glonniSupabaseBridge.url;

    // Load the app script
    const script = document.createElement('script');
    script.src = '/glonni-app.js';
    script.async = false;
    document.body.appendChild(script);

    // Wire up PWA buttons after script loads
    script.onload = () => {
      const installBtn = document.getElementById('pwa-install-btn');
      const dismissBtn = document.getElementById('pwa-dismiss-btn');
      if (installBtn) {
        installBtn.addEventListener('click', () => {
          if (typeof window.pwaInstall === 'function') window.pwaInstall();
        });
      }
      if (dismissBtn) {
        dismissBtn.addEventListener('click', () => {
          if (typeof window.pwaDismiss === 'function') window.pwaDismiss();
        });
      }
    };

    return () => {
      // Cleanup on unmount (unlikely in prod but good practice)
      if (script.parentNode) script.parentNode.removeChild(script);
    };
  }, []);

  return null;
}
