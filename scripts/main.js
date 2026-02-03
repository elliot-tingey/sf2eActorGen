
import { QuickGenApp } from "./QuickGenApp.js";

let quickGenApp;

function ensureApp() {
  if (!quickGenApp) quickGenApp = new QuickGenApp();
  return quickGenApp;
}

Hooks.once("init", () => {
  // Optional: module settings (lets you override compendium sources later)
  game.settings.register("sf2e-quickgen", "itemPacks", {
    name: "QuickGen: Item Packs",
    hint: "Comma-separated pack IDs to pull equipment from. Leave blank for auto-detect.",
    scope: "world",
    config: true,
    type: String,
    default: ""
  });

  game.settings.register("sf2e-quickgen", "spellPacks", {
    name: "QuickGen: Spell Packs",
    hint: "Comma-separated pack IDs to pull spells from. Leave blank for auto-detect.",
    scope: "world",
    config: true,
    type: String,
    default: ""
  });

  game.settings.register("sf2e-quickgen", "featurePacks", {
    name: "QuickGen: Feature Packs",
    hint: "Comma-separated pack IDs to pull class features/actions from (usually feats/features). Leave blank for auto-detect.",
    scope: "world",
    config: true,
    type: String,
    default: ""
  });
});

Hooks.once("ready", () => {
  if (!game.user.isGM) return;
  ensureApp();
});

/**
 * Inject a "QuickGen NPC" button into the Actors sidebar header, adjacent to Create Actor.
 */
Hooks.on("renderActorDirectory", (app, html) => {
  if (!game.user.isGM) return;

  // Avoid duplicates on re-render
  if (html.find('button[data-action="sf2e-quickgen"]').length) return;

  // Foundry's built-in create button
  const createBtn = html.find('button[data-action="create"]');
  if (!createBtn.length) return;

  const quickBtn = $(`
    <button type="button" class="create-document" data-action="sf2e-quickgen">
      <i class="fa-solid fa-dice"></i> QuickGen NPC
    </button>
  `);

  quickBtn.on("click", () => ensureApp().render(true));

  // Insert right after Create Actor
  createBtn.after(quickBtn);
});
