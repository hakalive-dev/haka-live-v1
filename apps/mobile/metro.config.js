const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Transform .svg imports into React components via react-native-svg-transformer
config.transformer = {
  ...config.transformer,
  babelTransformerPath: require.resolve('react-native-svg-transformer'),
  // Defer module evaluation until first use. With ~300 app modules, eagerly
  // running every top-level import at boot adds measurable JS startup cost;
  // inlineRequires moves each require to its first reference. Side-effect-only
  // imports (e.g. the url-polyfill at App.tsx top) are left intact by Metro.
  getTransformOptions: async () => ({
    transform: { inlineRequires: true },
  }),
};
config.resolver = {
  ...config.resolver,
  assetExts: config.resolver.assetExts.filter((ext) => ext !== 'svg').concat(['svga']),
  sourceExts: [...config.resolver.sourceExts, 'svg'],
  resolveRequest: (context, moduleName, platform) => {
    // @supabase/supabase-js ESM build contains a dynamic import(variable) that Hermes
    // can't compile. Force the CJS build which is Hermes-safe.
    if (moduleName === '@supabase/supabase-js') {
      return {
        filePath: require.resolve('@supabase/supabase-js/dist/index.cjs'),
        type: 'sourceFile',
      };
    }
    return context.resolveRequest(context, moduleName, platform);
  },
};

module.exports = config;
