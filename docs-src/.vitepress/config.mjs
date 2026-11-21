import { defineConfig } from 'vitepress';

const BASE = '/CodeTweak/';

export default defineConfig({
  title: 'CodeTweak',
  description: 'A free userscript manager and editor for Chrome and Firefox.',
  lang: 'en-US',
  base: BASE,
  lastUpdated: true,
  cleanUrls: true,
  srcExclude: ['README.md'],
  head: [
    ['link', { rel: 'icon', type: 'image/png', href: `${BASE}icon32.png` }],
    ['meta', { name: 'theme-color', content: '#61afef' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'CodeTweak' }],
    [
      'meta',
      {
        property: 'og:description',
        content: 'A free userscript manager and editor for Chrome and Firefox.',
      },
    ],
  ],
  themeConfig: {
    logo: '/icon32.png',
    nav: [
      { text: 'Install', link: '/guide/installation' },
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'API Reference', link: '/reference/gm-apis' },
      { text: 'Help', link: '/troubleshooting/common-issues' },
    ],
    sidebar: [
      {
        text: 'Get started',
        items: [
          { text: 'Install CodeTweak', link: '/guide/installation' },
          { text: 'Your first script', link: '/guide/getting-started' },
        ],
      },
      {
        text: 'Using CodeTweak',
        items: [
          { text: 'Popup and element picker', link: '/guide/popup' },
          { text: 'Dashboard and settings', link: '/guide/dashboard' },
          { text: 'Script editor', link: '/guide/editor' },
          { text: 'Installing and updating scripts', link: '/guide/greasyfork' },
        ],
      },
      {
        text: 'Writing scripts',
        items: [
          { text: 'Userscript basics', link: '/guide/writing-userscripts' },
          { text: 'Choosing sites', link: '/reference/match-patterns' },
          { text: 'Run timing', link: '/reference/run-timing' },
        ],
      },
      {
        text: 'GM API reference',
        items: [
          { text: 'Overview', link: '/reference/gm-apis' },
          { text: 'Storage', link: '/reference/gm-apis/storage' },
          { text: 'Page and browser UI', link: '/reference/gm-apis/ui' },
          { text: 'Network, clipboard, downloads', link: '/reference/gm-apis/network' },
          { text: 'Resources', link: '/reference/gm-apis/resources' },
          { text: 'Page access and utilities', link: '/reference/gm-apis/advanced' },
        ],
      },
      {
        text: 'Help',
        items: [
          { text: 'Troubleshooting', link: '/troubleshooting/common-issues' },
          { text: 'Sites that block scripts', link: '/troubleshooting/strict-sites' },
          { text: 'Privacy policy', link: '/guide/privacy' },
        ],
      },
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/MrBlankCoding/CodeTweak' }],
    search: { provider: 'local' },
    outline: { level: [2, 3] },
    editLink: {
      pattern: 'https://github.com/MrBlankCoding/CodeTweak/edit/main/docs-src/:path',
      text: 'Suggest a change to this page',
    },
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © CodeTweak contributors',
    },
  },
});
