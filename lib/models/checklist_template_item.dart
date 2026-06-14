class ChecklistTemplateItem {
  final int? id;
  final String label;
  final String section;
  final int sortOrder;

  ChecklistTemplateItem({
    this.id,
    required this.label,
    required this.section,
    required this.sortOrder,
  });

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'label': label,
      'section': section,
      'sort_order': sortOrder,
    };
  }

  factory ChecklistTemplateItem.fromMap(Map<String, dynamic> map) {
    return ChecklistTemplateItem(
      id: map['id'],
      label: map['label'],
      section: map['section'],
      sortOrder: map['sort_order'],
    );
  }
}
