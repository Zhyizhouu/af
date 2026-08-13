import 'package:flutter/material.dart';

import '../theme/af_text.dart';
import '../theme/af_tokens.dart';

class AFSegment<T> {
  final T value;
  final String label;

  /// Optional read-out appended in parentheses, e.g. a count.
  final String? badge;

  const AFSegment({required this.value, required this.label, this.badge});
}

/// The QR Generator's `.seg` control: one hairline box divided into equal
/// cells, the active cell filled with the accent.
class AFSegmented<T> extends StatelessWidget {
  final List<AFSegment<T>> segments;
  final T value;
  final ValueChanged<T> onChanged;

  /// Segments size to their content instead of splitting the width evenly.
  final bool shrinkWrap;

  const AFSegmented({
    super.key,
    required this.segments,
    required this.value,
    required this.onChanged,
    this.shrinkWrap = false,
  });

  @override
  Widget build(BuildContext context) {
    final t = context.af;

    final cells = <Widget>[];
    for (var i = 0; i < segments.length; i++) {
      final segment = segments[i];
      final selected = segment.value == value;
      final isLast = i == segments.length - 1;

      Widget cell = _Cell(
        segment: segment,
        selected: selected,
        isLast: isLast,
        onTap: () => onChanged(segment.value),
      );

      cells.add(shrinkWrap ? cell : Expanded(child: cell));
    }

    return Container(
      decoration: BoxDecoration(
        color: t.sunken,
        borderRadius: t.borderRadius,
        border: Border.all(color: t.lineStrong),
      ),
      clipBehavior: Clip.antiAlias,
      child: Row(
        mainAxisSize: shrinkWrap ? MainAxisSize.min : MainAxisSize.max,
        children: cells,
      ),
    );
  }
}

class _Cell<T> extends StatelessWidget {
  final AFSegment<T> segment;
  final bool selected;
  final bool isLast;
  final VoidCallback onTap;

  const _Cell({
    required this.segment,
    required this.selected,
    required this.isLast,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final t = context.af;
    final foreground = selected ? Colors.white : t.muted;

    return Semantics(
      button: true,
      selected: selected,
      label: segment.label,
      child: Material(
        color: selected ? t.accent : Colors.transparent,
        child: InkWell(
          onTap: onTap,
          highlightColor: t.accentSoft,
          splashColor: t.accentSoft,
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 9, horizontal: 10),
            decoration: BoxDecoration(
              border: isLast
                  ? null
                  : Border(right: BorderSide(color: t.lineStrong)),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Flexible(
                  child: Text(
                    segment.label,
                    textAlign: TextAlign.center,
                    overflow: TextOverflow.ellipsis,
                    style: AFText.mono(
                      size: 13,
                      color: foreground,
                      weight: FontWeight.w600,
                    ),
                  ),
                ),
                if (segment.badge != null) ...[
                  const SizedBox(width: 5),
                  Text(
                    segment.badge!,
                    style: AFText.mono(
                      size: 11,
                      color: selected
                          ? Colors.white.withValues(alpha: 0.75)
                          : t.muted.withValues(alpha: 0.75),
                      weight: FontWeight.w600,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
