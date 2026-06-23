/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testMatch: ['**/*.spec.ts', '**/*.prop.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/index.ts'],
  // Map doc 08 sections so `jest -t "GATE-"` etc. filters by case-ID prefix.
  verbose: true,
};
