// Expo config plugin: keep the CMake build folders of native modules on a short path on Windows.
//
// CMake names object files after the full source path, so a module such as
// @shopify/react-native-skia, built inside node_modules/<module>/android/.cxx of a repository that
// already sits a few folders deep, goes past Windows' 260-character path limit and ninja fails with
// "mkdir(...): No such file or directory". Enabling long paths needs an administrator; instead this
// moves each module's CMake staging folder to `<user home>/.cxx/<hash>` (or to the folder in the
// ANDROID_CXX_STAGING_DIR environment variable, on any OS). Linux and macOS builds (CI included)
// are unchanged unless that variable is set.
const { withProjectBuildGradle } = require('expo/config-plugins');

const MARKER = '// kinfall: short native build folders (plugins/withShortNativeBuildDir.js)';

const SNIPPET = `
${MARKER}
def cxxStagingRoot = System.getenv('ANDROID_CXX_STAGING_DIR') ?:
    (System.getProperty('os.name').toLowerCase().contains('windows') ? new File(System.getProperty('user.home'), '.cxx').path : null)
if (cxxStagingRoot) {
    subprojects { sub ->
        ['com.android.library', 'com.android.application'].each { pluginId ->
            sub.plugins.withId(pluginId) {
                def key = Integer.toHexString((rootDir.path + sub.path).hashCode())
                sub.android.externalNativeBuild.cmake.buildStagingDirectory = new File(cxxStagingRoot, key)
            }
        }
    }
}
`;

module.exports = function withShortNativeBuildDir(config) {
  return withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') throw new Error('withShortNativeBuildDir: expected a Groovy build.gradle');
    const contents = cfg.modResults.contents;
    if (contents.includes(MARKER)) return cfg;
    // Before the root plugins: they evaluate some subprojects early, and the staging folder must be
    // set before a subproject reads it.
    const anchor = 'apply plugin: "expo-root-project"';
    if (!contents.includes(anchor)) throw new Error('withShortNativeBuildDir: no expo-root-project in build.gradle');
    cfg.modResults.contents = contents.replace(anchor, `${SNIPPET.trimStart()}\n${anchor}`);
    return cfg;
  });
};
