import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/session_provider.dart';

class AddSessionDialog extends ConsumerStatefulWidget {
  const AddSessionDialog({super.key});

  @override
  ConsumerState<AddSessionDialog> createState() => _AddSessionDialogState();
}

class _AddSessionDialogState extends ConsumerState<AddSessionDialog> {
  String _type = 'Assignment';
  DateTime? _selectedDateTime;
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
    final date = await showDatePicker(
      context: context,
      initialDate: DateTime.now(),
      firstDate: DateTime.now().subtract(const Duration(days: 1)),
      lastDate: DateTime(2100),
    );
    if (date == null) return;

    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.now(),
    );
    if (time == null) return;

    setState(() {
      _selectedDateTime = DateTime(
        date.year,
        date.month,
        date.day,
        time.hour,
        time.minute,
      );
    });
  }

  Future<void> _save() async {
    if (_selectedDateTime == null || _roomController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please fill in all fields.')),
      );
      return;
    }

    await ref
        .read(sessionControllerProvider)
        .createSession(
          type: _type,
          dateTime: _selectedDateTime!,
          room: _roomController.text.trim(),
          courseCode: _courseCodeController.text.trim(),
          courseName: _courseNameController.text.trim(),
          courseClass: _courseClassController.text.trim(),
        );

    if (context.mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Add Proctor Session'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            DropdownButtonFormField<String>(
              value: _type,
              decoration: const InputDecoration(labelText: 'Type'),
              items: const [
                DropdownMenuItem(
                  value: 'Assignment',
                  child: Text('Assignment'),
                ),
                DropdownMenuItem(
                  value: 'Final Exam',
                  child: Text('Final Exam'),
                ),
              ],
              onChanged: (value) => setState(() => _type = value!),
            ),
            const SizedBox(height: 12),
            OutlinedButton(
              onPressed: _pickDateTime,
              child: Text(
                _selectedDateTime == null
                    ? 'Pick Date & Time'
                    : _selectedDateTime!.toString(),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _roomController,
              decoration: const InputDecoration(labelText: 'Room'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _courseCodeController,
              decoration: const InputDecoration(
                labelText: 'Course Code (e.g. COSC6092001)',
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _courseNameController,
              decoration: const InputDecoration(
                labelText: 'Course Name (e.g. Code Reengineering)',
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _courseClassController,
              decoration: const InputDecoration(
                labelText: 'Course Class (e.g. BB01)',
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        ElevatedButton(onPressed: _save, child: const Text('Save')),
      ],
    );
  }
}
