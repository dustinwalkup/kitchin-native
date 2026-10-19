// Expo's default Metro config, wrapped by Sentry so each bundle carries the debug ID that matches
// the source maps uploaded during EAS production builds (R26.9, specs/mvp/2-design.md §3.9).
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

module.exports = getSentryExpoConfig(__dirname);
