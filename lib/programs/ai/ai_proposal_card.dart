import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../theme/af_text.dart';
import '../../theme/af_tokens.dart';
import '../../widgets/af_button.dart';
import '../../widgets/af_chip.dart';
import '../../widgets/af_panel.dart';
import '../calendar/event_category.dart';
import 'ai_api.dart';

final DateFormat _day = DateFormat('EEE d MMM');
final DateFormat _clock = DateFormat('HH:mm');

/// One proposed session, laid out so it can be checked at a glance.
///
/// Every field the model filled in is shown, including the empty ones. A blank
/// room is exactly the kind of thing worth noticing before confirming, and a
/// card that quietly omitted it would hide the one mistake worth catching.
class SessionProposalCard extends StatelessWidget {
  final SessionProposal proposal;
  final VoidCallback? onRemove;

  const SessionProposalCard({
    super.key,
    required this.proposal,
    this.onRemove,
  });

  @override
  Widget build(BuildContext context) {
    final t = context.af;

    return AFPanel(
      label: 'Session',
      countWidget: AFChip(label: proposal.type, color: t.accent),
      margin: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            proposal.label.isEmpty ? 'Untitled course' : proposal.label,
            style: AFText.mono(size: 13.5, color: t.ink, weight: FontWeight.w700),
          ),
          const SizedBox(height: 10),
          _Row(
            label: 'When',
            value: '${_day.format(proposal.start)} · '
                '${_clock.format(proposal.start)}',
          ),
          _Row(label: 'Room', value: proposal.room, missing: proposal.room.isEmpty),
          _Row(
            label: 'Class',
            value: proposal.courseClass,
            missing: proposal.courseClass.isEmpty,
          ),
          if (onRemove != null) ...[
            const SizedBox(height: 14),
            AFButton.quiet(label: 'Remove', expand: true, onPressed: onRemove),
          ],
        ],
      ),
    );
  }
}

/// One proposed calendar event.
class EventProposalCard extends StatelessWidget {
  final EventProposal proposal;
  final EventCategory category;
  final VoidCallback? onRemove;

  const EventProposalCard({
    super.key,
    required this.proposal,
    required this.category,
    this.onRemove,
  });

  @override
  Widget build(BuildContext context) {
    final t = context.af;

    final when = proposal.allDay
        ? '${_day.format(proposal.start)} · all day'
        : '${_day.format(proposal.start)} · '
            '${_clock.format(proposal.start)}–${_clock.format(proposal.end)}';

    return AFPanel(
      label: 'Event',
      countWidget: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          CategoryDot(category: category),
          const SizedBox(width: 6),
          Text(category.label, style: AFText.panelCount(context)),
        ],
      ),
      margin: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            proposal.title,
            style: AFText.mono(size: 13.5, color: t.ink, weight: FontWeight.w700),
          ),
          const SizedBox(height: 10),
          _Row(label: 'When', value: when),
          if (proposal.notes.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(proposal.notes, style: AFText.body(context, color: t.muted)),
          ],
          if (onRemove != null) ...[
            const SizedBox(height: 14),
            AFButton.quiet(label: 'Remove', expand: true, onPressed: onRemove),
          ],
        ],
      ),
    );
  }
}

class _Row extends StatelessWidget {
  final String label;
  final String value;

  /// Renders an em dash in the warn colour rather than an empty gap, so a
  /// field the model could not fill is visible instead of merely absent.
  final bool missing;

  const _Row({required this.label, required this.value, this.missing = false});

  @override
  Widget build(BuildContext context) {
    final t = context.af;

    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 58,
            child: Text(label, style: AFText.mono(size: 11.5, color: t.muted)),
          ),
          Expanded(
            child: Text(
              missing ? '— not given' : value,
              style: AFText.mono(
                size: 12,
                color: missing ? t.warn : t.ink,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
