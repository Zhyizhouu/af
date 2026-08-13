import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../models/calendar_event.dart';
import '../../widgets/af_button.dart';
import '../../widgets/af_field.dart';
import '../../widgets/af_text_field.dart';
import 'category_picker.dart';
import 'calendar_provider.dart';

/// Create or edit a calendar event.
class EventEditorDialog extends ConsumerStatefulWidget {
  /// Null creates a new event on [initialDay].
  final CalendarEvent? event;
  final DateTime initialDay;

  /// Start hour for a new event, when created by tapping a slot in the time
  /// grid. Null falls back to the next whole hour.
  final int? initialHour;

  const EventEditorDialog({
    super.key,
    this.event,
    required this.initialDay,
    this.initialHour,
  });

  @override
  ConsumerState<EventEditorDialog> createState() => _EventEditorDialogState();
}

class _EventEditorDialogState extends ConsumerState<EventEditorDialog> {
  static final DateFormat _dayFormat = DateFormat('EEE d MMM yyyy');

  late final TextEditingController _title =
      TextEditingController(text: widget.event?.title ?? '');
  late final TextEditingController _notes =
      TextEditingController(text: widget.event?.notes ?? '');

  late DateTime _day;
  late TimeOfDay _startTime;
  late TimeOfDay _endTime;
  late bool _allDay;
  late String _category;

  String? _error;

  @override
  void initState() {
    super.initState();
    final event = widget.event;

    _day = dayKey(event?.start ?? widget.initialDay);
    _allDay = event?.allDay ?? false;
    _category = (event?.category.isNotEmpty ?? false)
        ? event!.category
        : 'other';

    if (event != null) {
      _startTime = TimeOfDay.fromDateTime(event.start);
      _endTime = TimeOfDay.fromDateTime(event.end);
    } else {
      // A tapped slot wins; otherwise default to the next whole hour.
      final hour =
          widget.initialHour ?? DateTime.now().add(const Duration(hours: 1)).hour;
      _startTime = TimeOfDay(hour: hour, minute: 0);
      _endTime = TimeOfDay(hour: (hour + 1) % 24, minute: 0);
    }
  }

  @override
  void dispose() {
    _title.dispose();
    _notes.dispose();
    super.dispose();
  }

  DateTime get _start => _allDay
      ? DateTime(_day.year, _day.month, _day.day)
      : DateTime(_day.year, _day.month, _day.day, _startTime.hour,
          _startTime.minute);

  DateTime get _end => _allDay
      ? DateTime(_day.year, _day.month, _day.day, 23, 59)
      : DateTime(
          _day.year, _day.month, _day.day, _endTime.hour, _endTime.minute);

  Future<void> _pickDay() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _day,
      firstDate: DateTime(2000),
      lastDate: DateTime(2100),
    );
    if (picked != null) setState(() => _day = dayKey(picked));
  }

  Future<void> _pickTime({required bool start}) async {
    final picked = await showTimePicker(
      context: context,
      initialTime: start ? _startTime : _endTime,
    );
    if (picked == null) return;
    setState(() {
      if (start) {
        _startTime = picked;
        // Keep the end after the start rather than silently rejecting later.
        if (_toMinutes(_endTime) <= _toMinutes(picked)) {
          _endTime = TimeOfDay(hour: (picked.hour + 1) % 24, minute: picked.minute);
        }
      } else {
        _endTime = picked;
      }
    });
  }

  static int _toMinutes(TimeOfDay time) => time.hour * 60 + time.minute;

  Future<void> _save() async {
    final title = _title.text.trim();
    if (title.isEmpty) {
      setState(() => _error = 'Give the event a title.');
      return;
    }
    if (!_allDay && _toMinutes(_endTime) <= _toMinutes(_startTime)) {
      setState(() => _error = 'The end time must be after the start time.');
      return;
    }

    await ref.read(calendarControllerProvider).save(
          id: widget.event?.id,
          title: title,
          notes: _notes.text.trim(),
          start: _start,
          end: _end,
          allDay: _allDay,
          category: _category,
        );

    if (mounted) Navigator.of(context).pop();
  }

  Future<void> _delete() async {
    final event = widget.event;
    if (event == null) return;
    await ref.read(calendarControllerProvider).delete(event.id);
    if (mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final editing = widget.event != null;

    return AlertDialog(
      title: Text(editing ? 'EDIT EVENT' : 'NEW EVENT'),
      content: SizedBox(
        width: 380,
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              AFField(
                label: 'Title',
                topSpacing: 4,
                child: AFTextField(
                  controller: _title,
                  mono: false,
                  hint: 'What is it?',
                  autofocus: !editing,
                  textCapitalization: TextCapitalization.sentences,
                ),
              ),

              AFField(
                label: 'Date',
                value: _dayFormat.format(_day),
                child: AFButton.ghost(
                  label: 'Change date',
                  icon: Icons.event_outlined,
                  expand: true,
                  onPressed: _pickDay,
                ),
              ),

              AFField(
                label: 'All day',
                value: _allDay ? 'on' : 'off',
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Switch(
                    value: _allDay,
                    onChanged: (value) => setState(() => _allDay = value),
                  ),
                ),
              ),

              if (!_allDay)
                AFField(
                  label: 'Time',
                  value: '${_startTime.format(context)} — '
                      '${_endTime.format(context)}',
                  child: Row(
                    children: [
                      Expanded(
                        child: AFButton.ghost(
                          label: _startTime.format(context),
                          onPressed: () => _pickTime(start: true),
                        ),
                      ),
                      const SizedBox(width: 9),
                      Expanded(
                        child: AFButton.ghost(
                          label: _endTime.format(context),
                          onPressed: () => _pickTime(start: false),
                        ),
                      ),
                    ],
                  ),
                ),

              AFField(
                label: 'Category',
                value: 'sets the colour',
                child: CategoryPicker(
                  selectedSlug: _category,
                  onChanged: (slug) => setState(() => _category = slug),
                ),
              ),

              AFField(
                label: 'Notes',
                value: 'optional',
                child: AFTextField(
                  controller: _notes,
                  mono: false,
                  hint: 'Anything worth remembering',
                  minLines: 2,
                  maxLines: 4,
                  textCapitalization: TextCapitalization.sentences,
                ),
              ),

              if (_error != null) AFHint(_error!),
            ],
          ),
        ),
      ),
      actions: [
        if (editing)
          AFButton.danger(label: 'Delete', onPressed: _delete),
        AFButton.quiet(
          label: 'Cancel',
          onPressed: () => Navigator.of(context).pop(),
        ),
        AFButton(label: editing ? 'Save' : 'Create', onPressed: _save),
      ],
    );
  }
}
