/** @type {import('jest').Config} */
module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          allowUmdGlobalAccess: true,
          allowJs: true,
          allowSyntheticDefaultImports: true,
          target: 'ESNext',
          module: 'commonjs',
          moduleResolution: 'node',
          baseUrl: '.',
          esModuleInterop: true,
          paths: {
            '@/*': ['./src/*'],
            '@util/*': ['./util/*'],
          },
          types: ['jest', 'node', 'jquery', 'jqueryui', 'lodash', 'toastr', 'type-fest', 'yaml', 'zod'],
        },
      },
    ],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@util/(.*)$': '<rootDir>/util/$1',
  },
  coverageProvider: 'v8',
};
