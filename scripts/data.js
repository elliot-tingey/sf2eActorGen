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

export const inventoryWeightOptions = [
  { value: "noCredits", label: "No credits", defaultWeight: 1 },
  { value: "moreAmmo", label: "More ammo", defaultWeight: 1 },
  { value: "moreArmor", label: "More armor", defaultWeight: 1 },
  { value: "moreCredits", label: "More credits", defaultWeight: 1 },
  { value: "moreGrenades", label: "More grenades", defaultWeight: 1 },
  { value: "moreHeals", label: "More heals", defaultWeight: 1 },
  { value: "moreMagic", label: "More magic", defaultWeight: 1 },
  { value: "moreTech", label: "More tech", defaultWeight: 1 },
  { value: "moreUpgrades", label: "More upgrades", defaultWeight: 1 },
  { value: "moreWeapons", label: "More weapons", defaultWeight: 1 }
];

export function getInventoryWeightOptions() {
  return inventoryWeightOptions;
}

export function getAncestryOptions() {
  return [
    { value: "random", label: "Random" },
    ...ancestries.map((a) => ({ value: a.key, label: a.label }))
  ];
}
