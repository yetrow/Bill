import { COLORS, type Category } from "../domain/book.ts";

// Legacy books may reuse colors. Give repeated colors a distinct display tint
// without altering the saved categories or their identifiers.
export function categoryColors(categories: Category[]) {
  const used = new Set<string>();
  const palette = [
    ...COLORS,
    "#a89f58",
    "#a87850",
    "#7879b3",
    "#b46761",
    "#639492",
    "#bc7da6",
  ];
  return new Map(
    categories.map((category, i) => {
      const preferred = category.color.toLowerCase();
      const color = used.has(preferred)
        ? (palette.find((c) => !used.has(c)) ??
          `hsl(${(i * 137.508) % 360} 38% 55%)`)
        : preferred;
      used.add(color);
      return [category.id, color];
    }),
  );
}
