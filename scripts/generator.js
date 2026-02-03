import { ancestries, classRoadmaps } from "./data.js";

function randInt(min, max) {
  const a = Math.ceil(min);
  const b = Math.floor(max);
  return Math.floor(Math.random() * (b - a + 1)) + a;
}

function pickOne(arr) {
  return arr[randInt(0, arr.length - 1)];
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function resolveStrength(strengthKey) {
  if (strengthKey !== "random") return strengthKey;
  const r = Math.random();
  if (r < 0.70) return "normal";
  if (r < 0.85) return "weak";
  return "elite";
}

function strengthToAdjustment(strengthKey) {
  if (strengthKey === "weak") return "weak";
  if (strengthKey === "elite") return "elite";
  return null;
}

function resolveClass(classKey) {
  if (classKey !== "random") return classKey;
  const keys = Object.keys(classRoadmaps).filter((k) => k !== "none");
  return pickOne(keys);
}

function slugify(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function buildNpcFromForm(formData) {
  const ancestryKeyInput = String(formData.ancestryKey ?? "random");
  const manualName = String(formData.manualName ?? "").trim();
  const randomName = !!formData.randomName;

  const minLevel = clamp(Number(formData.minLevel ?? 1), -1, 25);
  const maxLevel = clamp(Number(formData.maxLevel ?? 1), -1, 25);
  const level = randInt(Math.min(minLevel, maxLevel), Math.max(minLevel, maxLevel));

  const rarity = String(formData.rarity ?? "rare");
  const sizeInput = String(formData.size ?? "auto");

  const classKeyResolved = resolveClass(String(formData.classKey ?? "random"));
  const strengthKeyResolved = resolveStrength(String(formData.strengthKey ?? "normal"));

  const ancestryResolved =
    ancestryKeyInput === "random"
      ? pickOne(ancestries)
      : (ancestries.find((a) => a.key === ancestryKeyInput) ?? pickOne(ancestries));

  const resolvedSize = sizeInput === "auto" ? (ancestryResolved?.size ?? "med") : sizeInput;

  const shouldRandomizeName = randomName || manualName.length === 0;
  const resolvedName = shouldRandomizeName
    ? pickOne(ancestryResolved?.names?.length ? ancestryResolved.names : ["NPC"])
    : manualName;

  const actor = await Actor.create(
    {
      name: resolvedName,
      type: "npc",
      system: {
        traits: { rarity, size: { value: resolvedSize } },
        details: { level: { value: level }, alliance: "opposition" }
      }
    },
    { renderSheet: false }
  );

  if (!actor) throw new Error("Actor.create failed");

  // TODO: move your stat generation logic here (same as macro),
  // but as actor.update calls.

  // Strength toggle (built-in)
  await actor.update({ "system.attributes.adjustment": strengthToAdjustment(strengthKeyResolved) });

  // Add ancestry trait
  const trait = slugify(ancestryResolved.key);
  const existing = Array.isArray(actor.system.traits?.value) ? Array.from(actor.system.traits.value) : [];
  if (trait && !existing.includes(trait)) existing.push(trait);
  await actor.update({ "system.traits.value": existing });

  // Fix HP current = max (after adjustments)
  const hpMax = actor.system.attributes?.hp?.max ?? actor.system.attributes?.hp?.value;
  if (typeof hpMax === "number") await actor.update({ "system.attributes.hp.value": hpMax });

  // Optionally: set blurb/publicNotes like before

  return actor;
}
