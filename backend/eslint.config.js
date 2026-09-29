const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['data/', 'node_modules/'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: globals.node,
    },
    rules: {
      // Express identifica los manejadores de error por aridad (err, req, res, next)
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
];
