import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../providers/session_provider.dart';
import '../../theme/af_text.dart';
import '../../theme/af_tokens.dart';
import '../../widgets/af_button.dart';
import '../../widgets/af_field.dart';
import '../../widgets/af_segmented.dart';
import '../../widgets/af_text_field.dart';

class AddSessionDialog extends ConsumerStatefulWidget {
  const AddSessionDialog({super.key});

  @override
  ConsumerState<AddSessionDialog> createState() => _AddSessionDialogState();
}

class _AddSessionDialogState extends ConsumerState<AddSessionDialog> {
  static final DateFormat _stamp = DateFormat('EEE d MMM yyyy · HH:mm');

  String _type = 'UAP';
  DateTime? _dateTime;
  String? _error;
  bool _saving = false;

  final _roomController = TextEditingController();
  final _courseCodeController = TextEditingController();
  final _courseNameController = TextEditingController();
  final _courseClassController = TextEditingController();

  @override
  void dispose() {
    _roomController.dispose();
    _courseCodeController.dispose();
    _courseNameController.dispose();
    _courseClassController.dispose();
    super.dispose();
  }

  Future<void> _pickDateTime() async {
    final now = DateTime.now();
    final date = await showDatePicker(
      context: context,
      initialDate: _dateTime ?? now,
      firstDate: now.subtract(const Duration(days: 1)),
      lastDate: DateTime(2100),
    );
    if (date == null || !mounted) return;

    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(_dateTime ?? now),
    );
    if (time == null) return;

    setState(() {
      _dateTime = DateTime(
        date.year,
        date.month,
        date.day,
        time.hour,
        time.minute,
      );
      _error = null;
    });
  }

  Future<void> _save() async {
    if (_dateTime == null) {
      setState(() => _error = 'Pick a date and time first.');
      return;
    }
    if (_roomController.text.trim().isEmpty) {
      setState(() => _error = 'Room is required.');
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
    });

    await ref.read(sessionControllerProvider).createSession(
          type: _type,
          dateTime: _dateTime!,
          room: _roomController.text.trim(),
          courseCode: _courseCodeController.text.trim(),
          courseName: _courseNameController.text.trim(),
          courseClass: _courseClassController.text.trim(),
        );

    if (mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final t = context.af;

    return AlertDialog(
      title: const Text('NEW PROCTOR SESSION'),
      contentPadding: const EdgeInsets.fromLTRB(24, 12, 24, 0),
      content: SizedBox(
        width: 380,
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              AFField(
                label: 'Type',
                value: _type == 'UAP' ? 'assignment' : 'final exam',
                topSpacing: 0,
                child: AFSegmented<String>(
                  value: _type,
                  onChanged: (value) => setState(() => _type = value),
                  segments: const [
                    AFSegment(value: 'UAP', label: 'UAP'),
                    AFSegment(value: 'UAS', label: 'UAS'),
                  ],
                ),
              ),
              AFField(
                label: 'Date & time',
                value: _dateTime == null ? 'not set' : null,
                child: AFButton.ghost(
                  label: _dateTime == null
                      ? 'Pick date & time'
                      : _stamp.format(_dateTime!),
                  icon: Icons.event_outlined,
                  expand: true,
                  onPressed: _pickDateTime,
                ),
              ),
              AFField(
                label: 'Room',
                value: 'required',
                child: AFTextField(
                  controller: _roomController,
                  hint: '724',
                  textCapitalization: TextCapitalization.characters,
                ),
              ),
              AFField(
                label: 'Course code',
                value: 'optional',
                child: AFTextField(
                  controller: _courseCodeController,
                  hint: 'COSC6092001',
                  textCapitalization: TextCapitalization.characters,
                ),
              ),
              AFField(
                label: 'Course name',
                value: 'optional',
                child: AFTextField(
                  controller: _courseNameController,
                  hint: 'Code Reengineering',
                  mono: false,
                  textCapitalization: TextCapitalization.words,
                ),
              ),
              AFField(
                label: 'Class',
                value: 'optional',
                child: AFTextField(
                  controller: _courseClassController,
                  hint: 'BB01',
                  textCapitalization: TextCapitalization.characters,
                ),
              ),
              if (_error != null)
                AFStatusLine(text: _error!, color: t.warn),
              const SizedBox(height: 8),
              Text(
                'The $_type template fills the checklist automatically.',
                style: AFText.meta(context),
              ),
            ],
          ),
        ),
      ),
      actions: [
        AFButton.quiet(
          label: 'Cancel',
          onPressed: _saving ? null : () => Navigator.of(context).pop(),
        ),
        AFButton(
          label: _saving ? 'Creating…' : 'Create session',
          onPressed: _saving ? null : _save,
        ),
      ],
    );
  }
}
