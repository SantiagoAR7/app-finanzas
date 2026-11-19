const { getDefaultConfig } = require('expo/metro-config');
const exclusionList = require('metro-config/private/defaults/exclusionList').default;
const path = require('path');

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);
const escapedRoot = projectRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ignoredPaths = [
  /\/\.git\/.*/,
  /\/\.expo\/.*/,
  new RegExp(`${escapedRoot}/node_modules/.*\\.(md|markdown|map|d\\.ts|flow|podspec|gradle|kt|java|h|m|mm|cpp|cc|c|swift|rb|sh|bash|bat|ps1|xcodeproj|xcworkspace)$`),
  new RegExp(`${escapedRoot}/node_modules/.*/(__tests__|__fixtures__|test|tests|docs|example|examples|website|benchmark|benchmarks)/.*`),
  new RegExp(`${escapedRoot}/node_modules/(eslint|eslint-.+|@eslint|@eslint-community|@typescript-eslint|typescript|@types|flow-parser|hermes-parser|terser|ajv|tsconfig-paths)/.*`),
  new RegExp(`${escapedRoot}/node_modules/react-native/(ReactAndroid|ReactCommon|React|ReactApple|sdks|third-party-podspecs|gradle|flow|scripts|types_DEPRECATED|types_generated)/.*`),
  new RegExp(`${escapedRoot}/node_modules/@react-native/(debugger-frontend|gradle-plugin|codegen)/.*`),
  new RegExp(`${escapedRoot}/node_modules/(react-native-reanimated|react-native-gesture-handler|react-native-worklets)/((android|ios|cpp|common|docs|fabric|gradle|src/reanimated2/jestUtils|src/reanimated2/platform-specific/web|plugin|__tests__|jest|mock|mocked|lib/module/reanimated2/jestUtils|lib/module/reanimated2/platform-specific/web|lib/commonjs/reanimated2/jestUtils|lib/commonjs/reanimated2/platform-specific/web)/.*|.*\\.(md|map))`),
  new RegExp(`${escapedRoot}/node_modules/expo/(android|ios|scripts|templates|vendor|ts-declarations)/.*`),
  new RegExp(`${escapedRoot}/node_modules/expo-router/(android|ios|local-maven-repo|plugin)/.*`),
  new RegExp(`${escapedRoot}/node_modules/@expo/(cli/build/src/export|cli/build/src/install|cli/build/src/prebuild|cli/build/src/run|cli/build/src/utils/analytics|metro-runtime/src/error-overlay|devtools|devcert|image-utils|osascript|spawn-async)/.*`),
  new RegExp(`${escapedRoot}/node_modules/react-native-web/dist/exports/(Animated|AppRegistry|StyleSheet|Text|View)/__tests__/.*`),
];

const defaultBlockList = Array.isArray(config.resolver.blockList)
  ? config.resolver.blockList
  : [config.resolver.blockList].filter(Boolean);

config.maxWorkers = 1;
config.resolver.resolverMainFields = ['react-native', 'browser', 'module', 'main'];
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  ws: path.resolve(projectRoot, 'src/shims/ws.ts'),
};
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'ws') {
    return {
      type: 'sourceFile',
      filePath: path.resolve(projectRoot, 'src/shims/ws.ts'),
    };
  }

  return context.resolveRequest(context, moduleName, platform);
};
config.resolver.blockList = exclusionList([...defaultBlockList, ...ignoredPaths]);
config.watcher = {
  ...config.watcher,
  healthCheck: {
    enabled: false,
  },
};

module.exports = config;
