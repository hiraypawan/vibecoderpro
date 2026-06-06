// Adsterra Ad Configuration
// All ad placements for maximum revenue with minimal user irritation

export const AD_CONFIG = {
  // Smartlink - High CPM, triggered on export/download clicks
  smartlink: {
    url: 'https://www.effectivecpmnetwork.com/tjcvv01td1?key=3251dcf6af5aa3f67ad42af55926a82c',
    id: 29536079,
  },

  // Social Bar - Always visible at bottom (passive income)
  socialBar: {
    script: 'https://pl29636579.effectivecpmnetwork.com/b5/4f/fd/b54ffd303d188a0ef3db9fea77d2e63a.js',
    id: 29536080,
  },

  // Popunder - Triggered on specific actions (export, import, preview)
  popunder: {
    script: 'https://pl29636580.effectivecpmnetwork.com/43/dc/31/43dc31c8d7f48a83b9da7fbaf5d72f6e.js',
    id: 29536081,
  },

  // Native Banner - In sidebar/panels (native ads have good engagement)
  nativeBanner: {
    script: 'https://pl29636581.effectivecpmnetwork.com/5cb70a221eebfdaca42f062f2f73d1b8/invoke.js',
    containerId: 'container-5cb70a221eebfdaca42f062f2f73d1b8',
    id: 29536082,
  },

  // Banners by size
  banners: {
    '468x60': {
      key: '184abf15faa433b3387d1bd927b7aa0e',
      script: 'https://www.highperformanceformat.com/184abf15faa433b3387d1bd927b7aa0e/invoke.js',
      width: 468,
      height: 60,
      id: 29536083,
    },
    '300x250': {
      key: '8ce8aefef55d37e2f465ecb9b5871823',
      script: 'https://www.highperformanceformat.com/8ce8aefef55d37e2f465ecb9b5871823/invoke.js',
      width: 300,
      height: 250,
      id: 29536084,
    },
    '160x300': {
      key: '7d049607e3fa5180adc44e6f9944a004',
      script: 'https://www.highperformanceformat.com/7d049607e3fa5180adc44e6f9944a004/invoke.js',
      width: 160,
      height: 300,
      id: 29536085,
    },
    '160x600': {
      key: '89db10a87d329fd770bd2262a8a1f26c',
      script: 'https://www.highperformanceformat.com/89db10a87d329fd770bd2262a8a1f26c/invoke.js',
      width: 160,
      height: 600,
      id: 29536086,
    },
    '320x50': {
      key: '829c680e8f7d5db7ddb972f3d0a4cf75',
      script: 'https://www.highperformanceformat.com/829c680e8f7d5db7ddb972f3d0a4cf75/invoke.js',
      width: 320,
      height: 50,
      id: 29536087,
    },
    '728x90': {
      key: '48b99b3bb6843d0a16f36b70ce577a34',
      script: 'https://www.highperformanceformat.com/48b99b3bb6843d0a16f36b70ce577a34/invoke.js',
      width: 728,
      height: 90,
      id: 29536088,
    },
  },

  // Direct Links - For specific user actions
  directLinks: [
    'https://www.effectivecpmnetwork.com/j6bh5iqd?key=0c264a425ee1d24de630ff7c8dbb0dc6',
    'https://www.effectivecpmnetwork.com/nqzjmp1ys8?key=2702c4439947f8cbfe3e418d2203ddf0',
    'https://www.effectivecpmnetwork.com/arn0mhy0bq?key=7cd20e49aa78df81e985147b5698d6b2',
  ],
};

// Ad placement strategy:
// 1. Social Bar - Always visible (passive income, ~$0.80-2.50 CPM)
// 2. Popunder - On export/import/download clicks (high CPM, ~$1.50-4.00)
// 3. Native Banner - In sidebar (good engagement, ~$0.50-1.50 CPM)
// 4. 320x50 - Mobile above tab bar (mobile traffic)
// 5. 728x90 - Desktop header (desktop traffic)
// 6. 300x250 - Desktop sidebar (desktop traffic)
// 7. Smartlink - On export clicks (high CPM)
// 8. Direct Links - On preview clicks (moderate CPM)
