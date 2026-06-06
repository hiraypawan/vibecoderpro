export default function StructuredData() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Vibe Coder Pro',
    url: 'https://vibecoderpro.vercel.app',
    description: 'Free AI-powered browser IDE. Write code, generate full projects with AI chat, live preview, terminal, and Monaco editor.',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Web Browser',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    featureList: [
      'AI Code Generation',
      'Live Preview',
      'Built-in Terminal',
      'Monaco Editor',
      'File Explorer',
      'One-click Export',
      'Google Sign-in',
    ],
    screenshot: 'https://vibecoderpro.vercel.app/og-image.png',
    softwareVersion: '1.0.0',
    author: {
      '@type': 'Organization',
      name: 'Vibe Coder Pro',
      url: 'https://vibecoderpro.vercel.app',
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
