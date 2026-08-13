/// Selects the browser URL strategy, or a no-op off the web.
///
/// `flutter_web_plugins` only exists on web targets, so the choice has to be
/// made at import time rather than behind a `kIsWeb` branch.
library;

export 'url_strategy_noop.dart'
    if (dart.library.js_interop) 'url_strategy_web.dart';
