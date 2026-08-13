import 'package:flutter/material.dart';

import '../../theme/af_tokens.dart';

/// A theme-aware colour pair.
///
/// Categories reference a tone by index rather than storing a raw colour, so
/// every category stays legible on both themes. A stored `Color(0xFFFFFFFF)`
/// could not — white is invisible on the light theme's white panels.
@immutable
class CategoryTone {
  final String name;
  final Color light;
  final Color dark;

  const CategoryTone({
    required this.name,
    required this.light,
    required this.dark,
  });

  Color resolve(BuildContext context) =>
      Theme.of(context).brightness == Brightness.dark ? dark : light;
}

/// The palette categories draw from.
///
/// Light values are pushed dark enough to read on a white panel; dark values
/// are brightened for the dark desk. Index is what gets stored — append only,
/// never reorder, or existing categories change colour.
const List<CategoryTone> afCategoryTones = [
  CategoryTone(name: 'Blue', light: Color(0xFF3B49FF), dark: Color(0xFF5D69FF)),
  CategoryTone(name: 'Green', light: Color(0xFF2F8F4E), dark: Color(0xFF4FBF74)),
  CategoryTone(name: 'Orange', light: Color(0xFFC2621C), dark: Color(0xFFE8883F)),
  // "Yellow" as a legible amber — pure yellow fails against a white panel.
  CategoryTone(name: 'Yellow', light: Color(0xFFA37A00), dark: Color(0xFFE0B830)),
  // "White" as a neutral: slate on light, near-white on dark.
  CategoryTone(name: 'Neutral', light: Color(0xFF64748B), dark: Color(0xFFE2E5EA)),
  CategoryTone(name: 'Rose', light: Color(0xFFC02B5B), dark: Color(0xFFF06A94)),
  CategoryTone(name: 'Violet', light: Color(0xFF6D28D9), dark: Color(0xFFA78BFA)),
  CategoryTone(name: 'Teal', light: Color(0xFF0F766E), dark: Color(0xFF2DD4BF)),
  CategoryTone(name: 'Cyan', light: Color(0xFF0369A1), dark: Color(0xFF38BDF8)),
  CategoryTone(name: 'Brown', light: Color(0xFF7C4A21), dark: Color(0xFFC08552)),
];

CategoryTone toneAt(int index) =>
    afCategoryTones[index.clamp(0, afCategoryTones.length - 1)];

/// What an event *is*. Colour follows from the classification rather than
/// being chosen per event, so two "Work" events can never disagree.
///
/// Built-ins ship with the app; anything the user creates is stored and synced
/// but is otherwise the same shape.
@immutable
class EventCategory {
  /// Stored on the event and synced. Reordering never reclassifies anything,
  /// because the slug is the identity — not a position.
  final String slug;

  final String label;
  final int toneIndex;
  final bool builtIn;

  const EventCategory({
    required this.slug,
    required this.label,
    required this.toneIndex,
    this.builtIn = false,
  });

  CategoryTone get tone => toneAt(toneIndex);

  Color color(BuildContext context) => tone.resolve(context);

  @override
  bool operator ==(Object other) =>
      other is EventCategory && other.slug == slug;

  @override
  int get hashCode => slug.hashCode;
}

const List<EventCategory> builtInCategories = [
  EventCategory(slug: 'study', label: 'Study', toneIndex: 1, builtIn: true),
  EventCategory(slug: 'work', label: 'Work', toneIndex: 2, builtIn: true),
  EventCategory(
    slug: 'university',
    label: 'University',
    toneIndex: 3,
    builtIn: true,
  ),
  EventCategory(slug: 'self', label: 'Self', toneIndex: 4, builtIn: true),
  EventCategory(slug: 'health', label: 'Health', toneIndex: 5, builtIn: true),
  EventCategory(slug: 'social', label: 'Social', toneIndex: 6, builtIn: true),
  EventCategory(slug: 'other', label: 'Other', toneIndex: 0, builtIn: true),
];

/// Fallback for events whose category was deleted or never set.
const EventCategory fallbackCategory = EventCategory(
  slug: 'other',
  label: 'Other',
  toneIndex: 0,
  builtIn: true,
);

/// Maps the pre-classification palette index onto a built-in, so events
/// created before categories existed keep a sensible colour.
///
/// The old free-choice palette ran blue, green, rust, violet, teal, rose.
String legacyColorIndexToSlug(int index) => switch (index % 6) {
      1 => 'study',
      2 => 'work',
      3 => 'social',
      4 => 'self',
      5 => 'health',
      _ => 'other',
    };

/// A small colour disc for pickers, legends and rows.
class CategoryDot extends StatelessWidget {
  final EventCategory category;
  final double size;

  const CategoryDot({super.key, required this.category, this.size = 10});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: category.color(context),
        shape: BoxShape.circle,
        // The neutral tone is nearly the panel colour on dark; the hairline
        // keeps it from dissolving into the surface.
        border: Border.all(color: context.af.line, width: 0.5),
      ),
    );
  }
}
