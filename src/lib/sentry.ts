import * as Sentry from '@sentry/react-native';

import { env } from './env';
import { scrubBreadcrumb, scrubEvent } from './sentry-scrub';

/**
 * Starts error reporting (specs/mvp/2-design.md §3.9). Call it once, at the top of the root layout,
 * before anything renders. Configured by hand: never run `@sentry/wizard`.
 */
export function initSentry(): void {
  Sentry.init({
    dsn: env.sentryDsn ?? undefined,
    enabled: !__DEV__ && env.sentryDsn !== null, // no reports from debug builds (R26.8)
    environment: env.variant, // R26.8
    sendDefaultPii: false, // set explicitly: Sentry's Expo snippet sets true
    attachScreenshot: false, // R26.6
    attachViewHierarchy: false, // R26.6
    // The native iOS SDK's request breadcrumbs carry full URLs, query strings included, and native
    // crash reports never pass through beforeSend. The JS fetch breadcrumbs cover requests.
    enableNetworkBreadcrumbs: false,
    tracesSampleRate: 0, // DD7
    // Listing breadcrumbsIntegration replaces the default one. No replay integration (R26.6).
    integrations: [
      Sentry.breadcrumbsIntegration({ console: false }), // R26.6
      Sentry.expoRouterIntegration(), // navigation breadcrumbs (OI-6)
    ],
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  });
}
