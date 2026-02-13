import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'CodeTweak Docs',
  description: 'Simple docs for using CodeTweak',
  lang: 'en-US',
  base: '/CodeTweak/',
  lastUpdated: true,
  cleanUrls: true,
  themeConfig: {
    logo: '/assets/icons/icon32.png',
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'API', link: '/reference/gm-apis' },
      { text: 'Troubleshooting', link: '/troubleshooting/common-issues' }
    ],
    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Getting Started', link: '/guide/getting-started' },
          { text: 'Install CodeTweak', link: '/guide/installation' },
          { text: 'Use the Editor', link: '/guide/editor' },
          { text: 'Manage Scripts', link: '/guide/dashboard' },
          { text: 'Install From Greasy Fork', link: '/guide/greasyfork' },
          { text: 'Privacy and Permissions', link: '/guide/privacy' }
        ]
      },
      {
        text: 'Reference',
        items: [
          { text: 'GM APIs', link: '/reference/gm-apis' },
          { text: 'Run Timing', link: '/reference/run-timing' },
          { text: 'Match Patterns', link: '/reference/match-patterns' }
        ]
      },
      {
        text: 'Troubleshooting',
        items: [
          { text: 'Common Issues', link: '/troubleshooting/common-issues' },
          { text: 'Strict Sites', link: '/troubleshooting/strict-sites' }
        ]
      }
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/MrBlankCoding/CodeTweak' }
    ],
    search: {
      provider: 'local'
    },
    footer: {
      message: 'MIT License',
      copyright: 'Copyright © CodeTweak Contributors'
    }
  },
  srcExclude: ['README.md']
});
