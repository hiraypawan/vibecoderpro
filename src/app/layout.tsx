import type { Metadata, Viewport } from 'next';
import './globals.css';
import AuthProvider from '@/components/AuthProvider';
import StructuredData from '@/components/StructuredData';

const SITE_URL = 'https://vibecoderpro.vercel.app';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Vibe Coder Pro — Free AI-Powered Browser IDE | Code with AI Assistant',
    template: '%s | Vibe Coder Pro',
  },
  description: 'Free AI-powered browser IDE. Write code, generate full projects with AI chat, live preview, terminal, and Monaco editor. No setup needed.',
  keywords: [
    'AI IDE', 'browser IDE', 'online code editor', 'AI code generator',
    'free coding environment', 'JavaScript IDE', 'HTML CSS JS editor',
    'AI assistant coding', 'VS Code online', 'code playground',
    'web development tool', 'AI programming', 'code in browser',
    'no setup IDE', 'Monaco editor online', 'AI web builder',
  ],
  authors: [{ name: 'Vibe Coder Pro' }],
  creator: 'Vibe Coder Pro',
  publisher: 'Vibe Coder Pro',
  formatDetection: { telephone: false },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: SITE_URL,
    siteName: 'Vibe Coder Pro',
    title: 'Vibe Coder Pro — Free AI-Powered Browser IDE',
    description: 'Write code and generate full projects with AI chat, live preview, terminal, and Monaco editor. Zero setup required.',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'Vibe Coder Pro — AI-Powered Browser IDE' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Vibe Coder Pro — Free AI-Powered Browser IDE',
    description: 'Write code and generate full projects with AI chat, live preview, terminal, and Monaco editor.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-video-preview': -1, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
  alternates: { canonical: SITE_URL },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Vibe Coder',
  },
};

export const viewport: Viewport = {
  themeColor: '#0d1117',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <StructuredData />
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes achievementSlideIn {
            0% { transform: translateX(120%); opacity: 0; }
            100% { transform: translateX(0); opacity: 1; }
          }
          @keyframes achievementPulse {
            0%, 100% { box-shadow: 0 0 20px rgba(240, 192, 64, 0.3); }
            50% { box-shadow: 0 0 40px rgba(240, 192, 64, 0.6); }
          }
          .achievement-popup {
            animation: achievementSlideIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
          }
        `}} />
      </head>
      <body suppressHydrationWarning>
        <AuthProvider>
          {children}
        </AuthProvider>

        {/* Adsterra Ads Integration - Cross-platform (proxied via rewrites for Safari/iOS) */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            if (localStorage.getItem('vibe_ads_disabled') === 'true') return;
            
            var isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

            function injectScript(originalUrl, container) {
              if (localStorage.getItem('vibe_ads_disabled') === 'true') return;
              // Route through our domain via rewrites (bypasses Safari ITP)
              var proxied = originalUrl
                .replace('https://www.highperformanceformat.com/', '/ads/')
                .replace('https://pl29636579.effectivecpmnetwork.com/', '/ads-cpm/')
                .replace('https://pl29636580.effectivecpmnetwork.com/', '/ads-cpm2/')
                .replace('https://pl29636581.effectivecpmnetwork.com/', '/ads-cpm3/');
              var s = document.createElement('script');
              s.src = proxied;
              s.async = true;
              (container || document.body).appendChild(s);
            }

            // === SOCIAL BAR (Always-on passive income) ===
            setTimeout(function() {
              if (localStorage.getItem('vibe_ads_disabled') === 'true') return;
              injectScript('https://pl29636579.effectivecpmnetwork.com/b5/4f/fd/b54ffd303d188a0ef3db9fea77d2e63a.js');
            }, 1000);

            // === POPUNDER (On high-value actions) ===
            var popunderLoaded = false;
            window.triggerPopunder = function() {
              if (localStorage.getItem('vibe_ads_disabled') === 'true') return;
              if (popunderLoaded) return;
              popunderLoaded = true;
              injectScript('https://pl29636580.effectivecpmnetwork.com/43/dc/31/43dc31c8d7f48a83b9da7fbaf5d72f6e.js');
              setTimeout(function() { popunderLoaded = false; }, 300000);
            };

            // === NATIVE BANNER (In sidebar) ===
            setTimeout(function() {
              if (localStorage.getItem('vibe_ads_disabled') === 'true') return;
              var container = document.getElementById('native-banner-container');
              if (!container) return;
              injectScript('https://pl29636581.effectivecpmnetwork.com/5cb70a221eebfdaca42f062f2f73d1b8/invoke.js', container);
            }, 2000);

            // === BANNER ADS ===
            function loadBanner(containerId, key, scriptUrl) {
              if (localStorage.getItem('vibe_ads_disabled') === 'true') return;
              var container = document.getElementById(containerId);
              if (!container) return;
              var optScript = document.createElement('script');
              optScript.textContent = 'window.atOptions = {key:"' + key + '",format:"iframe",height:90,width:728,params:{}};';
              container.appendChild(optScript);
              injectScript(scriptUrl, container);
            }

            setTimeout(function() {
              if (localStorage.getItem('vibe_ads_disabled') === 'true') return;
              if (!isMobile) {
                loadBanner('desktop-banner-container', '48b99b3bb6843d0a16f36b70ce577a34', 'https://www.highperformanceformat.com/48b99b3bb6843d0a16f36b70ce577a34/invoke.js');
              }
            }, 3000);

            setTimeout(function() {
              if (localStorage.getItem('vibe_ads_disabled') === 'true') return;
              if (isMobile) {
                var container = document.getElementById('mobile-banner-container');
                if (!container) return;
                var optScript = document.createElement('script');
                optScript.textContent = 'window.atOptions = {key:"829c680e8f7d5db7ddb972f3d0a4cf75",format:"iframe",height:50,width:320,params:{}};';
                container.appendChild(optScript);
                injectScript('https://www.highperformanceformat.com/829c680e8f7d5db7ddb972f3d0a4cf75/invoke.js', container);
              }
            }, 3500);

            // === SMARTLINK (On export/download) ===
            window.triggerSmartlink = function() {
              if (localStorage.getItem('vibe_ads_disabled') === 'true') return;
              window.open('https://www.effectivecpmnetwork.com/tjcvv01td1?key=3251dcf6af5aa3f67ad42af55926a82c', '_blank', 'noopener,noreferrer');
            };

            // === DIRECT LINKS (On preview) ===
            var directLinks = [
              'https://www.effectivecpmnetwork.com/j6bh5iqd?key=0c264a425ee1d24de630ff7c8dbb0dc6',
              'https://www.effectivecpmnetwork.com/nqzjmp1ys8?key=2702c4439947f8cbfe3e418d2203ddf0',
              'https://www.effectivecpmnetwork.com/arn0mhy0bq?key=7cd20e49aa78df81e985147b5698d6b2'
            ];
            var directLinkIndex = 0;
            window.triggerDirectLink = function() {
              if (localStorage.getItem('vibe_ads_disabled') === 'true') return;
              window.open(directLinks[directLinkIndex % directLinks.length], '_blank', 'noopener,noreferrer');
              directLinkIndex++;
            };
          }());
        `}} />

        {/* Ad container elements - Desktop only (mobile uses component-based ads) */}
        <div id="desktop-banner-container" style={{ position: 'fixed', top: '0', left: '50%', transform: 'translateX(-50%)', zIndex: 0, pointerEvents: 'auto' }} />
        {/* Legacy containers kept for compatibility */}
        <div id="mobile-banner-container" style={{ display: 'none' }} />
        <div id="native-banner-container" style={{ display: 'none' }} />
      </body>
    </html>
  );
}
