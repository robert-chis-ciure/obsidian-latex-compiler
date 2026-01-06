import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import type LaTeXCompilerPlugin from './main';
import { LaTeXPluginSettings, TeXEngine, CompilerBackendType } from './types';
import { autoDetectTexPath, isLatexmkAvailable } from './utils/platform';
import { TectonicDownloader } from './utils/TectonicDownloader';
import { TECTONIC_VERSION } from './constants';

export class LaTeXSettingTab extends PluginSettingTab {
  plugin: LaTeXCompilerPlugin;

  constructor(app: App, plugin: LaTeXCompilerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'LaTeX Compiler Settings' });

    // Compiler Backend Selection
    containerEl.createEl('h3', { text: 'Compiler Backend' });

    new Setting(containerEl)
      .setName('Compiler backend')
      .setDesc('Choose which LaTeX engine to use for compilation')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('tectonic', 'Tectonic (Recommended - No installation required)')
          .addOption('latexmk', 'latexmk (Requires TeX Live/MacTeX)')
          .setValue(this.plugin.settings.compilerBackend)
          .onChange(async (value: CompilerBackendType) => {
            this.plugin.settings.compilerBackend = value;
            await this.plugin.saveSettings();
            this.display(); // Refresh to show relevant settings
          })
      );

    // Tectonic-specific settings
    if (this.plugin.settings.compilerBackend === 'tectonic') {
      this.displayTectonicSettings(containerEl);
    } else {
      this.displayLatexmkSettings(containerEl);
    }

    containerEl.createEl('h3', { text: 'Default Project Settings' });

    // Default Engine
    new Setting(containerEl)
      .setName('Default TeX engine')
      .setDesc('Engine to use for new projects')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('pdflatex', 'pdfLaTeX')
          .addOption('xelatex', 'XeLaTeX')
          .addOption('lualatex', 'LuaLaTeX')
          .setValue(this.plugin.settings.defaultEngine)
          .onChange(async (value: TeXEngine) => {
            this.plugin.settings.defaultEngine = value;
            await this.plugin.saveSettings();
          })
      );

    // Default Output Directory
    new Setting(containerEl)
      .setName('Default output directory')
      .setDesc('Directory for build artifacts (relative to project root)')
      .addText((text) =>
        text
          .setPlaceholder('.latex-out')
          .setValue(this.plugin.settings.defaultOutputDir)
          .onChange(async (value) => {
            this.plugin.settings.defaultOutputDir = value || '.latex-out';
            await this.plugin.saveSettings();
          })
      );

    containerEl.createEl('h3', { text: 'Compilation Settings' });

    // Shell Escape Warning
    new Setting(containerEl)
      .setName('Enable shell-escape (global)')
      .setDesc(
        'WARNING: Security risk! Only enable if you trust all LaTeX code. Required for minted, pythontex, etc.'
      )
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.shellEscape).onChange(async (value) => {
          if (value) {
            // Show warning modal
            const confirmed = confirm(
              'Enabling shell-escape allows LaTeX to execute arbitrary shell commands. ' +
                'This is a security risk. Only enable if you trust all LaTeX code you compile.\n\n' +
                'Are you sure you want to enable shell-escape?'
            );
            if (!confirmed) {
              toggle.setValue(false);
              return;
            }
          }
          this.plugin.settings.shellEscape = value;
          await this.plugin.saveSettings();
        })
      );

    // Compile Timeout
    new Setting(containerEl)
      .setName('Compilation timeout')
      .setDesc('Maximum time for compilation in seconds (default: 300)')
      .addText((text) =>
        text
          .setPlaceholder('300')
          .setValue(String(this.plugin.settings.compileTimeout / 1000))
          .onChange(async (value) => {
            const seconds = parseInt(value, 10);
            if (!isNaN(seconds) && seconds > 0) {
              this.plugin.settings.compileTimeout = seconds * 1000;
              await this.plugin.saveSettings();
            }
          })
      );

    // Watch Debounce
    new Setting(containerEl)
      .setName('Watch mode debounce')
      .setDesc('Delay before recompiling after file changes (milliseconds)')
      .addText((text) =>
        text
          .setPlaceholder('500')
          .setValue(String(this.plugin.settings.watchDebounce))
          .onChange(async (value) => {
            const ms = parseInt(value, 10);
            if (!isNaN(ms) && ms >= 0) {
              this.plugin.settings.watchDebounce = ms;
              await this.plugin.saveSettings();
            }
          })
      );

    containerEl.createEl('h3', { text: 'Display Settings' });

    // Show Badbox Warnings
    new Setting(containerEl)
      .setName('Show badbox warnings')
      .setDesc('Display overfull/underfull box warnings in diagnostics')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showBadboxWarnings).onChange(async (value) => {
          this.plugin.settings.showBadboxWarnings = value;
          await this.plugin.saveSettings();
        })
      );

    // Installation Help
    containerEl.createEl('h3', { text: 'About' });

    const helpDiv = containerEl.createDiv({ cls: 'latex-compiler-help' });

    if (this.plugin.settings.compilerBackend === 'tectonic') {
      helpDiv.createEl('p', {
        text: 'Tectonic is a self-contained LaTeX engine that automatically downloads packages as needed. No separate TeX installation required!',
      });
      helpDiv.createEl('p', {
        text: 'On first compilation, Tectonic will download the binary (~30MB) and any required packages. Subsequent compilations will be faster.',
      });
    } else {
      helpDiv.createEl('p', {
        text: 'Using latexmk requires a TeX distribution to be installed on your system.',
      });

      const list = helpDiv.createEl('ul');
      list.createEl('li', { text: 'macOS: Install MacTeX from tug.org/mactex or via Homebrew' });
      list.createEl('li', { text: 'Windows: Install MiKTeX or TeX Live' });
      list.createEl('li', { text: 'Linux: Install TeX Live via your package manager' });

      helpDiv.createEl('p', {
        text: 'After installation, click "Auto-detect" above or manually enter the path to your TeX binaries.',
      });
    }
  }

  /**
   * Display Tectonic-specific settings
   */
  private displayTectonicSettings(containerEl: HTMLElement): void {
    const pluginDir = (this.app as any).vault.adapter.basePath + '/.obsidian/plugins/obsidian-latex-compiler';
    const downloader = new TectonicDownloader(pluginDir);

    // Tectonic Status
    const statusSetting = new Setting(containerEl)
      .setName('Tectonic status')
      .setDesc('Check if Tectonic is installed and ready');

    // Check status asynchronously
    (async () => {
      const isInstalled = await downloader.isInstalled();
      if (isInstalled) {
        const version = await downloader.getInstalledVersion();
        statusSetting.setDesc(`Tectonic ${version || 'unknown version'} is installed and ready`);
        statusSetting.addButton((button) =>
          button.setButtonText('Reinstall').onClick(async () => {
            button.setDisabled(true);
            button.setButtonText('Downloading...');
            const result = await downloader.install((progress) => {
              button.setButtonText(`Downloading: ${progress.percent}%`);
            });
            if (result.success) {
              new Notice(`Tectonic ${result.version} installed successfully`);
            } else {
              new Notice(`Installation failed: ${result.error}`);
            }
            this.display();
          })
        );
      } else if (downloader.isPlatformSupported()) {
        statusSetting.setDesc(`Tectonic ${TECTONIC_VERSION} will be downloaded on first compilation`);
        statusSetting.addButton((button) =>
          button.setButtonText('Download Now').onClick(async () => {
            button.setDisabled(true);
            button.setButtonText('Downloading...');
            const result = await downloader.install((progress) => {
              button.setButtonText(`Downloading: ${progress.percent}%`);
            });
            if (result.success) {
              new Notice(`Tectonic ${result.version} installed successfully`);
            } else {
              new Notice(`Installation failed: ${result.error}`);
            }
            this.display();
          })
        );
      } else {
        statusSetting.setDesc('Your platform is not supported for automatic Tectonic download. Please install manually.');
      }
    })();

    // Custom Tectonic Path
    new Setting(containerEl)
      .setName('Custom Tectonic path')
      .setDesc('Optional: Path to a custom Tectonic binary (leave empty to use downloaded version)')
      .addText((text) =>
        text
          .setPlaceholder('/usr/local/bin/tectonic')
          .setValue(this.plugin.settings.tectonicPath)
          .onChange(async (value) => {
            this.plugin.settings.tectonicPath = value;
            await this.plugin.saveSettings();
          })
      );
  }

  /**
   * Display latexmk-specific settings
   */
  private displayLatexmkSettings(containerEl: HTMLElement): void {
    // TeX Distribution Path
    new Setting(containerEl)
      .setName('TeX distribution path')
      .setDesc('Path to TeX binaries (leave empty for auto-detection)')
      .addText((text) =>
        text
          .setPlaceholder('/Library/TeX/texbin')
          .setValue(this.plugin.settings.texPath)
          .onChange(async (value) => {
            this.plugin.settings.texPath = value;
            await this.plugin.saveSettings();
          })
      )
      .addButton((button) =>
        button.setButtonText('Auto-detect').onClick(async () => {
          const detected = await autoDetectTexPath();
          if (detected) {
            this.plugin.settings.texPath = detected;
            await this.plugin.saveSettings();
            this.display();
            new Notice(`TeX path detected: ${detected}`);
          } else {
            new Notice('Could not auto-detect TeX installation');
          }
        })
      );

    // Check Installation Button
    new Setting(containerEl)
      .setName('Check installation')
      .setDesc('Verify that latexmk is accessible')
      .addButton((button) =>
        button.setButtonText('Check').onClick(async () => {
          const available = await isLatexmkAvailable(this.plugin.settings.texPath);
          if (available) {
            new Notice('latexmk is available and working');
          } else {
            new Notice('latexmk not found. Please install TeX Live or MacTeX.');
          }
        })
      );
  }
}
