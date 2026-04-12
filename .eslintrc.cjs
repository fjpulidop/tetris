module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  rules: {
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-non-null-assertion': 'warn',
    'no-console': 'off',
  },
  overrides: [
    // engine/ must not import from renderer/, input/, or ui/
    {
      files: ['src/engine/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['*/renderer/*', '../renderer/*', '../../renderer/*', '@renderer*'],
                message: 'engine/ must not import from renderer/',
              },
              {
                group: ['*/input/*', '../input/*', '../../input/*', '@input*'],
                message: 'engine/ must not import from input/',
              },
              {
                group: ['*/ui/*', '../ui/*', '../../ui/*', '@ui*'],
                message: 'engine/ must not import from ui/',
              },
            ],
          },
        ],
      },
    },
    // renderer/ must not import from input/ or ui/
    {
      files: ['src/renderer/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['*/input/*', '../input/*', '../../input/*', '@input*'],
                message: 'renderer/ must not import from input/',
              },
              {
                group: ['*/ui/*', '../ui/*', '../../ui/*', '@ui*'],
                message: 'renderer/ must not import from ui/',
              },
            ],
          },
        ],
      },
    },
    // input/ must not import from renderer/ or ui/
    {
      files: ['src/input/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['*/renderer/*', '../renderer/*', '../../renderer/*', '@renderer*'],
                message: 'input/ must not import from renderer/',
              },
              {
                group: ['*/ui/*', '../ui/*', '../../ui/*', '@ui*'],
                message: 'input/ must not import from ui/',
              },
            ],
          },
        ],
      },
    },
  ],
  env: {
    browser: true,
    es2022: true,
  },
  ignorePatterns: ['dist/', 'node_modules/', '*.cjs', 'vite.config.ts', 'vitest.config.ts'],
};
