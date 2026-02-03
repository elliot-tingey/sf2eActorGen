import { buildNpcFromForm } from "./generator.js";
import { getAncestryOptions } from "./data.js";

export class QuickGenApp extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "sf2e-quickgen",
      title: "SF2e NPC QuickGen",
      template: "modules/sf2e-quickgen/templates/quick-gen.hbs",
      width: 420,
      closeOnSubmit: false
    });
  }

  async getData() {
    const ancestryOptions = getAncestryOptions();
    return {
      ancestryOptions,
      rarityOptions: [
        { value: "common", label: "Common" },
        { value: "uncommon", label: "Uncommon" },
        { value: "rare", label: "Rare" },
        { value: "unique", label: "Unique" }
      ],
      sizeOptions: [
        { value: "auto", label: "Auto (from ancestry)" },
        { value: "tiny", label: "Tiny" },
        { value: "sm", label: "Small" },
        { value: "med", label: "Medium" },
        { value: "lg", label: "Large" },
        { value: "huge", label: "Huge" },
        { value: "grg", label: "Gargantuan" }
      ],
      strengthOptions: [
        { value: "normal", label: "Normal" },
        { value: "weak", label: "Weak" },
        { value: "elite", label: "Elite" },
        { value: "random", label: "Random" }
      ],
      classOptions: [
        { value: "none", label: "None (no class bias)" },
        { value: "random", label: "Random" },
        { value: "envoy", label: "Envoy" },
        { value: "mystic", label: "Mystic" },
        { value: "operative", label: "Operative" },
        { value: "solarian", label: "Solarian" },
        { value: "soldier", label: "Soldier" },
        { value: "witchwarper", label: "Witchwarper" },
        { value: "mechanic", label: "Mechanic" },
        { value: "technomancer", label: "Technomancer " }
      ]
    };
  }

  async _updateObject(_event, formData) {
    // formData is a flattened object like { "minLevel": "1", ... }
    try {
      const actor = await buildNpcFromForm(formData);
      ui.notifications.info(`Created ${actor.name}`);
      actor.sheet?.render(true);
    } catch (err) {
      console.error("SF2e QuickGen error:", err);
      ui.notifications.error("QuickGen failed. See console (F12).");
    }
  }
}
