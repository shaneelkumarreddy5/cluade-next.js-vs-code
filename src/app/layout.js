import './globals.css';
import GlonniApp from '@/components/GlonniApp';

export const metadata = {
  title: 'Glonni — Cashback-First Marketplace',
  description: "Shop smart with Glonni — India's cashback-first marketplace. Save on every purchase.",
  themeColor: '#010101',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Glonni',
  },
  other: {
    'mobile-web-app-capable': 'yes',
    'application-name': 'Glonni',
    'msapplication-TileColor': '#EDCF5D',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=Space+Mono:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {/* PWA Offline Bar */}
        <div className="offline-bar" id="offline-bar">
          📡 You&apos;re offline — some features may not work
        </div>

        {/* PWA Install Banner */}
        <div className="pwa-banner" id="pwa-banner">
          <div style={{ fontSize: '24px', flexShrink: 0 }}>🛍️</div>
          <div className="pwa-banner-text">
            <div className="pwa-banner-title">Install Glonni</div>
            <div className="pwa-banner-desc">
              Add to home screen for the best experience
            </div>
          </div>
          <div className="pwa-banner-actions">
            <button className="pwa-install-btn" id="pwa-install-btn">
              Install
            </button>
            <button className="pwa-dismiss-btn" id="pwa-dismiss-btn">
              ✕
            </button>
          </div>
        </div>

        {/* TOAST */}
        <div id="toast" className="toast">
          <span className="toast-icon"></span>
          <span id="toast-text"></span>
        </div>

        {/* APP ROOT */}
        <div id="app">
          <div id="nav-mount"></div>
          <div id="main"></div>
          <div id="footer-mount"></div>
        </div>

        {/* Portals */}
        <div id="cart-portal"></div>
        <div id="filter-portal"></div>
        <div id="auth-portal"></div>

        {/* Client-side app loader */}
        <GlonniApp />

        {children}
      </body>
    </html>
  );
}
