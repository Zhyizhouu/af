import 'package:flutter_test/flutter_test.dart';

import 'package:af/programs/calendar/event_category.dart';

/// Colour is derived from classification, so the mapping is worth pinning:
/// a wrong slug or a reordered palette silently recolours real events.
void main() {
  test('every built-in slug is unique', () {
    final slugs = builtInCategories.map((c) => c.slug).toList();
    expect(slugs.toSet().length, slugs.length);
  });

  test('the categories the user named map to the colours they named', () {
    EventCategory byName(String slug) =>
        builtInCategories.firstWhere((c) => c.slug == slug);

    expect(byName('study').tone.name, 'Green');
    expect(byName('work').tone.name, 'Orange');
    expect(byName('university').tone.name, 'Yellow');
    expect(byName('self').tone.name, 'Neutral');
  });

  test('every tone differs between light and dark', () {
    // A tone identical in both themes will be invisible on one of them.
    for (final tone in afCategoryTones) {
      expect(tone.light, isNot(tone.dark), reason: tone.name);
    }
  });

  test('toneAt clamps rather than throwing on an out-of-range index', () {
    expect(toneAt(-5), afCategoryTones.first);
    expect(toneAt(9999), afCategoryTones.last);
  });

  test('legacy palette indexes map onto real built-in slugs', () {
    final valid = builtInCategories.map((c) => c.slug).toSet();
    for (var i = 0; i < 12; i++) {
      expect(valid, contains(legacyColorIndexToSlug(i)));
    }
  });

  test('categories compare by slug, so a rename does not create a new one', () {
    const a = EventCategory(slug: 'x', label: 'Gym', toneIndex: 1);
    const b = EventCategory(slug: 'x', label: 'Fitness', toneIndex: 5);
    expect(a, b);
  });
}
