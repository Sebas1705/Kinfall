// Expo config plugin: keep CMake paths of native modules under Windows' 260-character limit.
//
// CMake names each object file after the full path of its source. For sources outside a module
// (Skia's cpp/ folder; the React Native codegen output of react-native-safe-area-context and
// react-native-screens, compiled by the app module) that gives paths such as
//   app/.cxx/RelWithDebInfo/<hash>/arm64-v8a/safeareacontext_autolinked_build/CMakeFiles/
//   react_codegen_safeareacontext.dir/C_/Users/.../node_modules/react-native-safe-area-context/
//   android/build/generated/source/codegen/jni/react/renderer/components/.../ComponentDescriptors.cpp.o
// which pass 260 characters from a repository a few folders deep, and ninja fails with
// "Filename longer than 260 characters" or "mkdir(...): No such file or directory". Enabling long
// paths needs an administrator, so on Windows hosts this plugin, for every native module:
//   1. passes CMAKE_OBJECT_PATH_MAX=250: when an object path would be longer, CMake replaces the
//      source folder part with a short hash (the Android toolchain does not set this limit);
//   2. moves the CMake build folder (.cxx) to `<user home>/.cxx/<hash>` (or ANDROID_CXX_STAGING_DIR),
//      so the folder itself is short enough for that hash to fit.
// Linux and macOS builds (CI included) are unchanged.
const { withProjectBuildGradle } = require('expo/config-plugins');

const MARKER = '// kinfall: short CMake paths on Windows (plugins/withWindowsCmakePaths.js)';

const SNIPPET = `${MARKER}
if (System.getProperty('os.name').toLowerCase().contains('windows')) {
    def cxxStagingRoot = System.getenv('ANDROID_CXX_STAGING_DIR') ?: new File(System.getProperty('user.home'), '.cxx').path
    subprojects { sub ->
        ['com.android.library', 'com.android.application'].each { pluginId ->
            sub.plugins.withId(pluginId) {
                def key = Integer.toHexString((rootDir.path + sub.path).hashCode())
                sub.android.externalNativeBuild.cmake.buildStagingDirectory = new File(cxxStagingRoot, key)
                sub.android.defaultConfig.externalNativeBuild.cmake.arguments('-DCMAKE_OBJECT_PATH_MAX=250')
            }
        }
    }
}
`;

module.exports = function withWindowsCmakePaths(config) {
  return withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') throw new Error('withWindowsCmakePaths: expected a Groovy build.gradle');
    const contents = cfg.modResults.contents;
    if (contents.includes(MARKER)) return cfg;
    // Before the root plugins: they evaluate some subprojects early, and both settings must be in
    // place before a subproject's native build is configured.
    const anchor = 'apply plugin: "expo-root-project"';
    if (!contents.includes(anchor)) throw new Error('withWindowsCmakePaths: no expo-root-project in build.gradle');
    cfg.modResults.contents = contents.replace(anchor, `${SNIPPET}\n${anchor}`);
    return cfg;
  });
};
