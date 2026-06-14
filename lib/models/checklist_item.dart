class ChecklistItem {
  final int? id;
  final int sessionId;
  final String label;
  final String section;
  final bool isChecked;
  final int sortOrder;

  ChecklistItem({
    this.id,
    required this.sessionId,
    required this.label,
    required this.section,
    this.isChecked = false,
    required this.sortOrder,
  });

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'session_id': sessionId,
      'label': label,
      'section': section,
      'is_checked': isChecked ? 1 : 0,
      'sort_order': sortOrder,
    };
  }

  factory ChecklistItem.fromMap(Map<String, dynamic> map) {
    return ChecklistItem(
      id: map['id'],
      sessionId: map['session_id'],
      label: map['label'],
      section: map['section'],
      isChecked: map['is_checked'] == 1,
      sortOrder: map['sort_order'],
    );
  }

  ChecklistItem copyWith({bool? isChecked}) {
    return ChecklistItem(
      id: id,
      sessionId: sessionId,
      label: label,
      section: section,
      isChecked: isChecked ?? this.isChecked,
      sortOrder: sortOrder,
    );
  }
}
