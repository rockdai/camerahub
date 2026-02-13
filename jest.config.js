/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  clearMocks: true,
  testMatch: ['**/test/**/*.test.js'],
  collectCoverageFrom: ['index.js'],
  coverageDirectory: 'coverage'
};
