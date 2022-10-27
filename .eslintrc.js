module.exports = {
  env: {
    node: true,
    es6: true,
  },
  extends: [
    'airbnb-base',
  ],
  globals: {
    Atomics: 'readonly',
    SharedArrayBuffer: 'readonly',
  },
  parserOptions: {
    ecmaVersion: 2018,
  },
  rules: {
    'no-use-before-define': 'off',
    'no-restricted-syntax': [
      'error',
      'LabeledStatement',
      'WithStatement',
    ],
    'no-unused-expressions': [
      'error',
      { 'allowShortCircuit': true }
    ],
    'prefer-const': [
      'error',
      { destructuring: 'all' }
    ],
    'no-underscore-dangle': 'off',
    'no-nested-ternary': 'off',
    'no-bitwise': 'off',
    'func-names': 'off',
    'no-restricted-globals': 'off',
    'import/order': 'off',
    'global-require': 'off',
    'no-param-reassign': ["error", { "props": false }],
    'camelcase': 'off',
  },
  overrides: [
    {
      files: ["*spec.js"],
      env: {
        mocha: true,
        node: true,
        browser: false,
      },
      rules: {
        'no-unused-expressions': 'off',
        'no-param-reassign': 'off',
      },
    }
  ]
};
