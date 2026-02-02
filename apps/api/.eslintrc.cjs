module.exports = {
  root: true,
  extends: ['@arbitrage/eslint-config'],
  parserOptions: {
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
  },
};
