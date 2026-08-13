import 'package:flutter_web_plugins/url_strategy.dart';

/// Drops the `#` so routes read as `/dashboard` rather than `/#/dashboard`.
///
/// This makes every route a real URL the browser can be loaded on directly,
/// which is why `vercel.json` rewrites unmatched paths to `index.html` —
/// without that rewrite a refresh on `/calendar` would 404 at the CDN.
void configureUrlStrategy() => usePathUrlStrategy();
