import type { Metadata, Viewport } from 'next';

const SITE_URL = 'https://vibecoderpro.vercel.app';
const SITE_NAME = 'Vibe Coder Pro';
const SITE_DESCRIPTION = 'Free AI-powered browser IDE. Write code, generate full projects with AI chat, live preview, terminal, and Monaco editor. No setup needed.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — Free AI-Powered Browser IDE | Code with AI Assistant`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: [
    'AI IDE', 'browser IDE', 'online code editor', 'AI code generator',
    'free coding environment', 'JavaScript IDE', 'HTML CSS JS editor',
    'AI assistant coding', 'VS Code online', 'code playground',
    'web development tool', 'AI programming', 'code in browser',
    'no setup IDE', 'Monaco editor online', 'AI web builder',
  ],
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  formatDetection: { telephone: false },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: SITE_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME} — Free AI-Powered Browser IDE`,
    description: 'Write code and generate full projects with AI chat, live preview, terminal, and Monaco editor. Zero setup required.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Vibe Coder Pro — AI-Powered Browser IDE',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME} — Free AI-Powered Browser IDE`,
    description: 'Write code and generate full projects with AI chat, live preview, terminal, and Monaco editor.',
    images: ['/og-image.png'],
    creator: '@vibecoderpro',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  alternates: {
    canonical: SITE_URL,
  },
  verification: {
    // Add these after creating accounts:
    // google: 'your-google-verification-code',
    // yandex: 'your-yandex-verification-code',
  },
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon-16x16.png',
    apple: '/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#0d1117',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};
