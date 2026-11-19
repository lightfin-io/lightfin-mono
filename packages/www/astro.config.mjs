// @ts-check
import react from '@astrojs/react'
import starlight from '@astrojs/starlight'
import { defineConfig } from 'astro/config'

// The marketing landing page lives at `/` (src/pages/index.astro); Starlight
// owns every /docs/* route. Docs content is nested under content/docs/docs/ so
// its slugs carry the `docs/` prefix, leaving the root free for marketing.
export default defineConfig({
  site: 'https://lightfin.dev',
  integrations: [
    react(),
    starlight({
      title: 'Lightfin',
      favicon: '/favicon.svg',
      logo: {
        src: './src/assets/logo.svg',
        alt: 'Lightfin',
      },
      description:
        'A small, dependency-free web charting library with TradingView-grade candlesticks, indicators and drawing tools.',
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/lightfin-io/lightfin-mono',
        },
      ],
      customCss: ['./src/styles/docs.css'],
      sidebar: [
        {
          label: 'Start here',
          items: [
            { label: 'Introduction', slug: 'docs/getting-started' },
            { label: 'Installation', slug: 'docs/installation' },
          ],
        },
        { label: 'Guides', autogenerate: { directory: 'docs/guides' } },
        { label: 'Reference', autogenerate: { directory: 'docs/api' } },
      ],
    }),
  ],
})
