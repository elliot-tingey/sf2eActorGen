export const ancestries = [
  { key: "android", label: "Android", size: "med", names: ["Asha", "Blue-17", "Chance"] },
  { key: "ysoki", label: "Ysoki", size: "sm", names: ["Cheeky", "Fidget", "Pippa"] }
  // ...your full list
];

export const classRoadmaps = {
  none: { label: "None", /* ... */ },
  envoy: { label: "Envoy", /* ... */ },
  // ...
  mechanic: { label: "Mechanic", /* ... */ },
  technomancer: { label: "Technomancer", /* ... */ }
};

export function getAncestryOptions() {
  return [
    { value: "random", label: "Random" },
    ...ancestries.map((a) => ({ value: a.key, label: a.label }))
  ];
}
