// Perfil via LH_PROFILE=mobile|desktop (padrão: desktop). Ex.: LH_PROFILE=mobile npx lhci autorun
const profile = process.env.LH_PROFILE === 'mobile' ? 'mobile' : 'desktop';

const settings =
  profile === 'mobile'
    ? { formFactor: 'mobile' } // emulação padrão do Lighthouse: Moto G Power, 4G lento simulado
    : {
        preset: 'desktop',
        formFactor: 'desktop',
        screenEmulation: { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false },
      };

module.exports = {
  ci: {
    collect: {
      url: ['http://localhost:4173/', 'http://localhost:4173/nft/nft-001'],
      startServerCommand: 'npx vite preview --port 4173 --strictPort',
      startServerReadyPattern: 'Local',
      numberOfRuns: 3,
      settings,
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.9 }],
        'categories:accessibility': ['error', { minScore: 0.95 }],
        'categories:best-practices': ['error', { minScore: 0.95 }],
        'categories:seo': ['error', { minScore: 0.9 }],
      },
    },
    upload: {
      target: 'filesystem',
      outputDir: `./docs/lighthouse/${profile}`,
      reportFilenamePattern: '%%PATHNAME%%-%%DATETIME%%.report.%%EXTENSION%%',
    },
  },
};
