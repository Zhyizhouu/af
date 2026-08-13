import 'package:flutter/material.dart';

import '../theme/af_text.dart';
import '../theme/af_tokens.dart';
import 'af_button.dart';

/// The masthead from the QR Generator: an accent tick, the program name in
/// mono, and a tagline pushed to the far right, all sitting on a heavy ink
/// rule. On narrow screens the tagline drops to its own line, matching the
/// original's `flex-wrap`.
class AFMasthead extends StatelessWidget {
  final String title;
  final String? tagline;
  final VoidCallback? onBack;
  final List<Widget> actions;

  const AFMasthead({
    super.key,
    required this.title,
    this.tagline,
    this.onBack,
    this.actions = const [],
  });

  @override
  Widget build(BuildContext context) {
    final t = context.af;

    final brand = Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (onBack != null) ...[
          AFIconButton(
            icon: Icons.arrow_back,
            onPressed: onBack,
            tooltip: 'Back',
            bordered: false,
          ),
          const SizedBox(width: 4),
        ],
        Container(
          width: 11,
          height: 11,
          margin: const EdgeInsets.only(right: 9),
          decoration: BoxDecoration(
            color: t.accent,
            borderRadius: BorderRadius.circular(2),
            boxShadow: [
              BoxShadow(color: t.accentSoft, spreadRadius: 3, blurRadius: 0),
            ],
          ),
        ),
        Flexible(
          child: Text(
            title.toUpperCase(),
            style: AFText.brand(context),
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );

    final taglineText = tagline == null
        ? null
        : Text(
            tagline!,
            style: AFText.mono(size: 12, color: t.muted, letterSpacing: 0.12),
            overflow: TextOverflow.ellipsis,
          );

    return Container(
      padding: const EdgeInsets.only(bottom: 16),
      margin: const EdgeInsets.only(bottom: 22),
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: t.ink, width: 1.5)),
      ),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final wide = constraints.maxWidth >= 560;

          if (wide) {
            // The brand is capped rather than flexed: giving it a flex slot
            // makes it surrender half the row even when the title is short,
            // which leaves the tagline stranded mid-row instead of at the
            // right edge. Only the tagline absorbs slack.
            return Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                ConstrainedBox(
                  constraints:
                      BoxConstraints(maxWidth: constraints.maxWidth * 0.55),
                  child: brand,
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: taglineText == null
                      ? const SizedBox.shrink()
                      : Align(
                          alignment: Alignment.centerRight,
                          child: taglineText,
                        ),
                ),
                if (actions.isNotEmpty) ...[
                  const SizedBox(width: 14),
                  ...actions,
                ],
              ],
            );
          }

          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  // Expanded, not Flexible+Spacer: the title should use every
                  // pixel the actions do not need before it ellipsizes.
                  Expanded(child: brand),
                  if (actions.isNotEmpty) ...[
                    const SizedBox(width: 12),
                    ...actions,
                  ],
                ],
              ),
              if (taglineText != null) ...[
                const SizedBox(height: 8),
                taglineText,
              ],
            ],
          );
        },
      ),
    );
  }
}

/// Page chrome shared by every AF program.
///
/// Centres a 940px column on the desk — the QR Generator's `.wrap` — and puts
/// the masthead above whatever the program draws.
class AFScaffold extends StatelessWidget {
  final String title;
  final String? tagline;
  final VoidCallback? onBack;
  final List<Widget> actions;

  /// Fills the space between masthead and [footer].
  final Widget child;

  /// Pinned below the content, inside the same centred column.
  final Widget? footer;

  final Widget? floatingActionButton;

  /// Horizontal breathing room. The QR page uses 20px.
  static const double gutter = 20;
  static const double maxContentWidth = 940;

  const AFScaffold({
    super.key,
    required this.title,
    this.tagline,
    this.onBack,
    this.actions = const [],
    required this.child,
    this.footer,
    this.floatingActionButton,
  });

  @override
  Widget build(BuildContext context) {
    final t = context.af;

    return Scaffold(
      backgroundColor: t.desk,
      floatingActionButton: floatingActionButton,
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: maxContentWidth),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: gutter),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const SizedBox(height: 28),
                  AFMasthead(
                    title: title,
                    tagline: tagline,
                    onBack: onBack,
                    actions: actions,
                  ),
                  Expanded(child: child),
                  if (footer != null) footer!,
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// The centred mono note at the bottom of the QR page.
class AFFooter extends StatelessWidget {
  final String text;

  const AFFooter(this.text, {super.key});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 24, bottom: 16),
      child: Text(
        text,
        textAlign: TextAlign.center,
        style: AFText.mono(size: 11, color: context.af.muted, letterSpacing: 0.22),
      ),
    );
  }
}

/// An empty-state block: a large muted glyph over a short mono explanation.
class AFEmptyState extends StatelessWidget {
  final String glyph;
  final String message;
  final Color? color;

  const AFEmptyState({
    super.key,
    this.glyph = '⊞',
    required this.message,
    this.color,
  });

  @override
  Widget build(BuildContext context) {
    final t = context.af;
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 220),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (glyph.isNotEmpty) ...[
              Text(
                glyph,
                style: AFText.mono(size: 26, color: color ?? t.lineStrong),
              ),
              const SizedBox(height: 10),
            ],
            Text(
              message,
              textAlign: TextAlign.center,
              style: AFText.mono(
                size: 12.5,
                color: color ?? t.muted,
                letterSpacing: 0.25,
                height: 1.7,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
