import { MetadataRoute } from 'next';

const SITE_URL = 'https://vibecoderpro.vercel.app';

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    '',
    '/pricing',
    '/changelog',
  ].map((route) => ({
    url: `${SITE_URL}${route}`,
    lastModified: new Date(),
    changeFrequency: route === '' ? 'weekly' as const : 'monthly' as const,
    priority: route === '' ? 1.0 : route === '/pricing' ? 0.8 : 0.6,
  }));

  return routes;
}
