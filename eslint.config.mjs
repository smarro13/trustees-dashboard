import nextConfig from 'eslint-config-next';

const eslintConfig = [
  ...nextConfig,
  {
    ignores: ['.next/**', 'node_modules/**'],
  },
  {
    rules: {
      // Flags every "load data on mount" useEffect(() => { loadData(); }, [])
      // across the app — the standard pages-router data-fetching pattern used
      // throughout this codebase, not a bug. Off rather than fought page-by-page.
      'react-hooks/set-state-in-effect': 'off',
      // React Compiler readiness rules (Math.random()/ref access during render).
      // This app doesn't use the React Compiler, and the flagged code (e.g. the
      // one-off confetti randomisation in presidents-lotto.tsx) is intentional,
      // working, pre-existing behaviour — not something this pass should refactor.
      'react-hooks/purity': 'off',
      'react-hooks/refs': 'off',
    },
  },
];

export default eslintConfig;
