// Expo's default Metro config already handles this npm workspaces monorepo (SDK 52+): it watches the
// workspace root and resolves from apps/mobile/node_modules and then the root node_modules, so
// @kinfall/core (a symlink to packages/core) is bundled from its TypeScript source. Package
// "exports" are on by default (SDK 53+), which is what maps @kinfall/core/<path> to src/<path>.ts.
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);
