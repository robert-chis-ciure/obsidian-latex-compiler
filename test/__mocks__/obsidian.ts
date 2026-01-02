// Mock Obsidian API for testing

export class App {}
export class Plugin {}
export class PluginSettingTab {}
export class Setting {
  setName() { return this; }
  setDesc() { return this; }
  addText() { return this; }
  addDropdown() { return this; }
  addToggle() { return this; }
  addButton() { return this; }
}
export class Notice {
  constructor(message: string) {}
}
export class Modal {}
export class ItemView {}
export class WorkspaceLeaf {}
export class TFile {}
export class TFolder {}

export function setIcon(el: HTMLElement, icon: string) {}
