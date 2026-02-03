import { ancestries, classRoadmaps, inventoryWeightOptions } from "./data.js";

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

function slugify(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
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

function parseInvWeights(formData) {
  // FormApplication flattens keys like "invWeight.moreAmmo": "2"
  const weights = {};
  for (const opt of inventoryWeightOptions) {
    const key = `invWeight.${opt.value}`;
    const raw = Number(formData[key]);
    weights[opt.value] = Number.isFinite(raw) ? Math.max(0, raw) : opt.defaultWeight;
  }
  return weights;
}

function pickWeighted(weightsByKey) {
  const entries = Object.entries(weightsByKey).filter(([, w]) => w > 0);
  if (!entries.length) return null;
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let roll = Math.random() * total;
  for (const [k, w] of entries) {
    roll -= w;
    if (roll <= 0) return k;
  }
  return entries[entries.length - 1][0];
}

function classToInventoryBias(classKeyResolved) {
  // Map class to one of the screenshot bias keys
  switch (classKeyResolved) {
    case "soldier": return "moreWeapons";
    case "operative": return "moreTech";
    case "envoy": return "moreCredits";
    case "mystic": return "moreHeals";
    case "witchwarper": return "moreMagic";
    case "solarian": return "moreArmor";
    case "mechanicPlaytest": return "moreUpgrades";
    case "technomancerPlaytest": return "moreMagic";
    default: return "moreWeapons";
  }
}

/**
 * Auto-detect packs if settings are blank.
 */
function getPackIdsFromSetting(settingKey) {
  const raw = String(game.settings.get("sf2e-quickgen", settingKey) ?? "").trim();
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function autoDetectPacks(kind) {
  // kind: "items" | "spells" | "features"
  const packs = Array.from(game.packs ?? []);

  const systemPacks = packs.filter((p) =>
    p?.documentName === "Item" &&
    (p.metadata?.packageType === "system" || p.metadata?.packageType === "module")
  );

  const byLabel = (needle) => systemPacks.filter((p) =>
    String(p.metadata?.label ?? "").toLowerCase().includes(needle)
  );

  if (kind === "spells") {
    const candidates = [...byLabel("spell"), ...byLabel("spells")];
    return candidates.map((p) => p.collection);
  }

  if (kind === "features") {
    const candidates = [...byLabel("feature"), ...byLabel("features"), ...byLabel("feat"), ...byLabel("feats"), ...byLabel("class")];
    return candidates.map((p) => p.collection);
  }

  // items
  const candidates = [...byLabel("equipment"), ...byLabel("items"), ...byLabel("weapons"), ...byLabel("armor")];
  return candidates.length ? candidates.map((p) => p.collection) : systemPacks.map((p) => p.collection);
}

async function getIndexedDocs(packId, fields) {
  const pack = game.packs.get(packId);
  if (!pack) return [];
  const index = await pack.getIndex({ fields });
  return index.map((e) => ({ packId, ...e }));
}

async function loadItemFromIndexEntry(entry) {
  // entry._id is in compendium; build uuid
  const uuid = `Compendium.${entry.packId}.${entry._id}`;
  return fromUuid(uuid);
}

function estimateSpellMaxRank(level) {
  // Conservative heuristic; adjust later if SF2e progression differs.
  // Goal: keep spells in a reasonable rank band rather than exploding.
  return clamp(Math.floor((level + 1) / 2), 1, 10);
}

function estimateSpellCount(level) {
  return clamp(2 + Math.floor(level / 3), 2, 10);
}

function looksLikeSpell(indexEntry) {
  return String(indexEntry.type ?? "").toLowerCase().includes("spell");
}

function looksLikeFeatOrFeature(indexEntry) {
  const t = String(indexEntry.type ?? "").toLowerCase();
  return t.includes("feat") || t.includes("feature");
}

function looksLikeEquipment(indexEntry) {
  const t = String(indexEntry.type ?? "").toLowerCase();
  return t.includes("weapon") || t.includes("armor") || t.includes("equipment") || t.includes("consum");
}

async function generateInventory(actor, level, biasKey, classKeyResolved) {
  // Credits + items. Uses compendiums if it can.
  const bias = biasKey ?? "moreWeapons";

  // Simple scaling. You can tune later.
  let credits = randInt(level * 10, level * 25);
  if (bias === "moreCredits") credits = randInt(level * 25, level * 60);
  if (bias === "noCredits") credits = 0;

  const itemsToAdd = clamp(2 + Math.floor(level / 4), 2, 10);

  const packIds = getPackIdsFromSetting("itemPacks");
  const sourcePackIds = packIds.length ? packIds : autoDetectPacks("items");

  // Index with minimal fields; we’ll load full docs only for picks.
  const fields = ["type", "system.level.value", "system.traits.value", "name"];
  const indexes = [];
  for (const pid of sourcePackIds) {
    try {
      indexes.push(...await getIndexedDocs(pid, fields));
    } catch (e) {
      console.warn("[sf2e-quickgen] pack index failed:", pid, e);
    }
  }

  const candidates = indexes.filter((e) => looksLikeEquipment(e));
  if (!candidates.length) {
    return {
      credits,
      addedItems: [],
      notes: ["No item compendium candidates found; inventory not added as Items."]
    };
  }

  function categoryScore(entry) {
    const name = String(entry.name ?? "").toLowerCase();
    const type = String(entry.type ?? "").toLowerCase();

    const isWeapon = type.includes("weapon");
    const isArmor = type.includes("armor");
    const isConsumable = type.includes("consum");
    const isAmmo = name.includes("ammo") || name.includes("munition");
    const isGrenade = name.includes("grenade");
    const isHeal = name.includes("med") || name.includes("healing") || name.includes("serum");
    const isTech = name.includes("tech") || name.includes("kit") || name.includes("device");
    const isUpgrade = name.includes("upgrade") || name.includes("mod") || name.includes("augment");
    const isMagic = name.includes("magic") || name.includes("mystic") || name.includes("arcane") || name.includes("occult");

    // Base weight
    let w = 1;

    // Bias multipliers
    if (bias === "moreWeapons" && isWeapon) w *= 4;
    if (bias === "moreArmor" && isArmor) w *= 4;
    if (bias === "moreAmmo" && isAmmo) w *= 4;
    if (bias === "moreGrenades" && isGrenade) w *= 4;
    if (bias === "moreHeals" && isHeal) w *= 4;
    if (bias === "moreTech" && isTech) w *= 4;
    if (bias === "moreUpgrades" && isUpgrade) w *= 4;
    if (bias === "moreMagic" && isMagic) w *= 4;

    // Mild “by-class” nudges if desired
    if (classKeyResolved === "soldier" && isWeapon) w *= 2;
    if (classKeyResolved === "operative" && (isTech || isGrenade)) w *= 2;
    if ((classKeyResolved === "mystic" || classKeyResolved === "witchwarper" || classKeyResolved === "technomancerPlaytest") && (isMagic || isHeal)) w *= 2;

    return w;
  }

  function pickCandidate() {
    // weighted pick from candidates
    const scored = candidates.map((c) => ({ c, w: categoryScore(c) })).filter((x) => x.w > 0);
    const total = scored.reduce((s, x) => s + x.w, 0);
    if (total <= 0) return null;
    let r = Math.random() * total;
    for (const x of scored) {
      r -= x.w;
      if (r <= 0) return x.c;
    }
    return scored[scored.length - 1].c;
  }

  const picked = [];
  const pickedIds = new Set();

  for (let i = 0; i < itemsToAdd; i++) {
    const entry = pickCandidate();
    if (!entry) break;
    const uniqueKey = `${entry.packId}.${entry._id}`;
    if (pickedIds.has(uniqueKey)) continue;
    pickedIds.add(uniqueKey);
    picked.push(entry);
  }

  const addedItems = [];
  for (const entry of picked) {
    try {
      const doc = await loadItemFromIndexEntry(entry);
      if (!doc) continue;

      const obj = doc.toObject();
      delete obj._id;
      const [created] = await actor.createEmbeddedDocuments("Item", [obj]);
      if (created) addedItems.push(created);
    } catch (e) {
      console.warn("[sf2e-quickgen] item add failed:", entry, e);
    }
  }

  return {
    credits,
    addedItems,
    notes: []
  };
}

async function generateSpellsAndFeatures(level, classKeyResolved) {
  const roadmap = classRoadmaps[classKeyResolved] ?? classRoadmaps.none;

  const wantsSpells = (classKeyResolved === "mystic" || classKeyResolved === "witchwarper" || classKeyResolved === "technomancerPlaytest");
  const wantsFeatures = classKeyResolved !== "none";

  const spellSuggestions = [];
  const featureSuggestions = [];
  const actionSuggestions = [];

  // Spells (best-effort)
  if (wantsSpells) {
    const maxRank = estimateSpellMaxRank(level);
    const count = estimateSpellCount(level);

    const packIds = getPackIdsFromSetting("spellPacks");
    const sourcePackIds = packIds.length ? packIds : autoDetectPacks("spells");
    const fields = ["type", "system.level.value", "system.traits.value", "name"];
    const indexes = [];

    for (const pid of sourcePackIds) {
      try {
        indexes.push(...await getIndexedDocs(pid, fields));
      } catch (e) {
        console.warn("[sf2e-quickgen] spell pack index failed:", pid, e);
      }
    }

    const spellCandidates = indexes
      .filter((e) => looksLikeSpell(e))
      .filter((e) => {
        const rank = Number(foundry.utils.getProperty(e, "system.level.value"));
        return Number.isFinite(rank) ? rank <= maxRank : true;
      });

    for (let i = 0; i < count; i++) {
      if (!spellCandidates.length) break;
      const entry = pickOne(spellCandidates);
      spellSuggestions.push(entry.name);
    }
  }

  // Features/actions (best-effort)
  if (wantsFeatures) {
    const packIds = getPackIdsFromSetting("featurePacks");
    const sourcePackIds = packIds.length ? packIds : autoDetectPacks("features");
    const fields = ["type", "system.level.value", "system.traits.value", "system.category", "name"];
    const indexes = [];

    for (const pid of sourcePackIds) {
      try {
        indexes.push(...await getIndexedDocs(pid, fields));
      } catch (e) {
        console.warn("[sf2e-quickgen] feature pack index failed:", pid, e);
      }
    }

    const classSlug = slugify(roadmap.label ?? classKeyResolved);

    const featCandidates = indexes
      .filter((e) => looksLikeFeatOrFeature(e))
      .filter((e) => {
        const featLevel = Number(foundry.utils.getProperty(e, "system.level.value"));
        if (Number.isFinite(featLevel) && featLevel > level) return false;

        const traits = foundry.utils.getProperty(e, "system.traits.value") ?? [];
        const traitsStr = Array.isArray(traits) ? traits.join(",").toLowerCase() : String(traits).toLowerCase();

        // Very loose match: if traits contain class name or label contains class name.
        const name = String(e.name ?? "").toLowerCase();
        return traitsStr.includes(classSlug) || name.includes(classSlug);
      });

    // Split suggestions: features vs actions (we don't have a reliable schema here yet)
    const picks = [];
    const seen = new Set();
    for (let i = 0; i < clamp(2 + Math.floor(level / 5), 2, 6); i++) {
      if (!featCandidates.length) break;
      const entry = pickOne(featCandidates);
      const key = `${entry.packId}.${entry._id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      picks.push(entry);
    }

    for (const p of picks) {
      // Heuristic: if name begins with common action-ish verbs, treat as action.
      const n = String(p.name ?? "");
      const isActiony = /^(strike|aim|get|take|use|raise|move|step|reload|suppress|activate)\b/i.test(n);
      (isActiony ? actionSuggestions : featureSuggestions).push(n);
    }
  }

  return { spellSuggestions, featureSuggestions, actionSuggestions };
}

async function applyMinimalCoreFields(actor, level, rarity, sizeValue, adjustment) {
  await actor.update({
    "system.details.level.value": level,
    "system.traits.rarity": rarity,
    "system.traits.size.value": sizeValue,
    "system.attributes.adjustment": adjustment
  });

  // Fix HP current to max after system recalculations
  const hpMax = actor.system.attributes?.hp?.max ?? actor.system.attributes?.hp?.value;
  if (typeof hpMax === "number") {
    await actor.update({ "system.attributes.hp.value": hpMax });
  }
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

  const inventoryMode = String(formData.inventoryMode ?? "byClass");
  const spellsMode = String(formData.spellsMode ?? "byClass");
  const addClassFeatures = !!formData.addClassFeatures;
  const addActions = !!formData.addActions;

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
        traits: {
          rarity,
          size: { value: resolvedSize }
        },
        details: {
          level: { value: level },
          alliance: "opposition"
        }
      }
    },
    { renderSheet: false }
  );

  if (!actor) throw new Error("Actor.create failed");

  // Ancestry trait
  const trait = slugify(ancestryResolved.key);
  const existingTraits = Array.isArray(actor.system.traits?.value) ? Array.from(actor.system.traits.value) : [];
  if (trait && !existingTraits.includes(trait)) existingTraits.push(trait);
  await actor.update({ "system.traits.value": existingTraits });

  // Strength adjustment (built-in weak/elite toggle)
  const adjustment = strengthToAdjustment(strengthKeyResolved);
  await applyMinimalCoreFields(actor, level, rarity, resolvedSize, adjustment);

  // Inventory bias selection
  let biasKey = null;
  if (inventoryMode === "byClass") {
    biasKey = classToInventoryBias(classKeyResolved);
  } else if (inventoryMode === "weighted") {
    const weights = parseInvWeights(formData);
    biasKey = pickWeighted(weights) ?? "moreWeapons";
  }

  // Inventory
  let inventorySummary = null;
  if (inventoryMode !== "none") {
    inventorySummary = await generateInventory(actor, level, biasKey, classKeyResolved);
  }

  // Spells/features/actions suggestions (and/or later: embedded Items)
  let sfa = { spellSuggestions: [], featureSuggestions: [], actionSuggestions: [] };
  if (spellsMode !== "none" || addClassFeatures || addActions) {
    sfa = await generateSpellsAndFeatures(level, classKeyResolved);
  }

  // Public notes summary
  const roadmap = classRoadmaps[classKeyResolved] ?? classRoadmaps.none;
  const resolvedAdj = actor.system.attributes?.adjustment ?? "normal";

  const creditsLine = inventorySummary
    ? `Credits: <strong>${inventorySummary.credits}</strong>`
    : `Credits: <em>(not generated)</em>`;

  const invItemsLine = inventorySummary?.addedItems?.length
    ? `Items added: <strong>${inventorySummary.addedItems.length}</strong>`
    : `Items added: <em>0</em>`;

  const spellsHtml = (spellsMode !== "none" && sfa.spellSuggestions.length)
    ? `<ul>${sfa.spellSuggestions.slice(0, 12).map((n) => `<li>${n}</li>`).join("")}</ul>`
    : `<em>None</em>`;

  const featuresHtml = (addClassFeatures && sfa.featureSuggestions.length)
    ? `<ul>${sfa.featureSuggestions.slice(0, 12).map((n) => `<li>${n}</li>`).join("")}</ul>`
    : `<em>None</em>`;

  const actionsHtml = (addActions && sfa.actionSuggestions.length)
    ? `<ul>${sfa.actionSuggestions.slice(0, 12).map((n) => `<li>${n}</li>`).join("")}</ul>`
    : `<em>None</em>`;

  const publicNotes = `
<p><strong>QuickGen</strong></p>
<p>
  Ancestry: <strong>${ancestryResolved.label}</strong><br/>
  Class: <strong>${roadmap.label ?? "None"}</strong><br/>
  Level: <strong>${actor.system.details?.level?.base ?? actor.system.details?.level?.value ?? level}</strong><br/>
  Adjustment: <strong>${resolvedAdj || "normal"}</strong><br/>
  Inventory bias: <strong>${biasKey ?? "none"}</strong><br/>
  ${creditsLine}<br/>
  ${invItemsLine}
</p>

<p><strong>Spells (suggested)</strong><br/>${spellsHtml}</p>
<p><strong>Class Features (suggested)</strong><br/>${featuresHtml}</p>
<p><strong>Actions (suggested)</strong><br/>${actionsHtml}</p>
<p><strong>Road map note</strong><br/>• ${roadmap.notes ?? "—"}</p>
  `.trim();

  await actor.update({
    "system.details.blurb": `Ancestry: ${ancestryResolved.label} | Class: ${roadmap.label ?? "None"}`,
    "system.details.publicNotes": publicNotes
  });

  // Re-apply HP current=max in case embedded items/features changed max
  const hpMaxAfter = actor.system.attributes?.hp?.max ?? actor.system.attributes?.hp?.value;
  if (typeof hpMaxAfter === "number") await actor.update({ "system.attributes.hp.value": hpMaxAfter });

  return actor;
}
