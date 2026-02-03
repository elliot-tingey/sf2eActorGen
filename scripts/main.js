import { QuickGenApp } from "./QuickGenApp.js";

let app;

Hooks.once("ready", () => {
  if (!game.user.isGM) return;
  app = new QuickGenApp();
});

Hooks.on("getSceneControlButtons", (controls) => {
  if (!game.user.isGM) return;

  const tokens = controls.find((c) => c.name === "token");
  if (!tokens) return;

  tokens.tools.sf2eQuickGen = {
    name: "sf2eQuickGen",
    title: "SF2e QuickGen",
    icon: "fa-solid fa-user-plus",
    button: true,
    visible: game.user.isGM,
    onClick: () => app?.render(true)
  };
});
