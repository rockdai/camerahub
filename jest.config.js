/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  clearMocks: true,
  collectCoverageFrom: ['index.js'],
  coverageDirectory: 'coverage'
};
