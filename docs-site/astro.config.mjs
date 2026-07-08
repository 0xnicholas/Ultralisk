import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
  site: 'https://docs.ultralisk.dev',
  integrations: [
    starlight({
      title: 'Ultralisk',
      logo: {
        src: './src/assets/logo.svg',
      },
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/PLACEHOLDER/Ultralisk',
        },
      ],
      sidebar: [
        {
          label: 'Getting Started',
          items: [
            { label: 'Overview', slug: 'getting-started' },
            { label: 'Quick Start', slug: 'getting-started/quickstart' },
          ],
        },
        {
          label: 'Architecture',
          items: [
            { label: 'Overview', slug: 'architecture/overview' },
            { label: 'Ultralisk Core', slug: 'architecture/ultralisk-core' },
          ],
        },
        {
          label: 'Deployment',
          items: [
            { label: 'Overview', slug: 'deployment' },
            { label: 'Private Data Center', slug: 'deployment/private-data-center' },
          ],
        },
        {
          label: 'Platform',
          items: [
            { label: 'Console', slug: 'platform/console' },
            { label: 'Cluster Management', slug: 'platform/cluster-management' },
            { label: 'Model Serving', slug: 'platform/model-serving' },
          ],
        },
        {
          label: 'API Reference',
          slug: 'api/reference',
        },
      ],
      customCss: ['./src/styles/custom.css'],
      editLink: {
        baseUrl: 'https://github.com/PLACEHOLDER/Ultralisk/edit/main/docs-site/',
      },
      lastUpdated: true,
    }),
  ],
});
