export default {
  displayName: 'user-layer-composition',
  preset: '../../../jest.preset.js',
  testEnvironment: 'node',
  transform: { '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }] },
  moduleFileExtensions: ['ts', 'js'],
  moduleNameMapper: { '^vscode$': '<rootDir>/../../../__mocks__/vscode.ts' },
  coverageDirectory: '../../../coverage/libs/backend/user-layer-composition',
};
