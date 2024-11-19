import {
	App,
	Editor,
	MarkdownView,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
} from "obsidian";
import * as crypto from "crypto";

interface AbbrLinkSettings {
	hashLength: number;
	skipExisting: boolean;
	autoGenerate: boolean;
}

const DEFAULT_SETTINGS: AbbrLinkSettings = {
	hashLength: 8,
	skipExisting: true,
	autoGenerate: false
};

export default class AbbrLinkPlugin extends Plugin {
	settings: AbbrLinkSettings;

	private generateSha256(str: string): string {
		return crypto
			.createHash("sha256")
			.update(str)
			.digest("hex")
			.substring(0, this.settings.hashLength);
	}

	private async processFile(file: TFile): Promise<void> {
		try {
			const content = await this.app.vault.read(file);

			if (content.includes("abbrlink:") && this.settings.skipExisting) {
				return;
			}

			const abbrlink = this.generateSha256(file.basename);
			let newContent: string;

			if (content.startsWith("---")) {
				const [frontMatter, ...rest] = content.split("---\n");
				const updatedFrontMatter = frontMatter.includes("abbrlink:") 
					? frontMatter.replace(/abbrlink:.*/, `abbrlink: ${abbrlink}`)
					: `${frontMatter}abbrlink: ${abbrlink}\n`;
				newContent = `${updatedFrontMatter}---\n${rest.join("---\n")}`;
			} else {
				newContent = `---\nabbrlink: ${abbrlink}\n---\n${content}`;
			}

			await this.app.vault.modify(file, newContent);
		} catch (error) {
			console.error(`Error processing file ${file.path}:`, error);
			throw error;
		}
	}

	async onload() {
		await this.loadSettings();

		this.addRibbonIcon(
			"link",
			"Generate Abbrlinks",
			async (evt: MouseEvent) => {
				try {
					new Notice("Processing files...");
					const files = this.app.vault.getMarkdownFiles();
					for (const file of files) {
						await this.processFile(file);
					}
					new Notice("Abbrlinks generated successfully!");
				} catch (error) {
					new Notice("Error generating abbrlinks!");
					console.error(error);
				}
			}
		);

		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText("Status Bar Text");

		this.addCommand({
			id: "open-sample-modal-simple",
			name: "Open sample modal (simple)",
			callback: () => {
				new SampleModal(this.app).open();
			},
		});

		this.addCommand({
			id: "sample-editor-command",
			name: "Sample editor command",
			editorCallback: (editor: Editor, view: MarkdownView) => {
				console.log(editor.getSelection());
				editor.replaceSelection("Sample Editor Command");
			},
		});

		this.addCommand({
			id: "open-sample-modal-complex",
			name: "Open sample modal (complex)",
			checkCallback: (checking: boolean) => {
				const markdownView =
					this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					if (!checking) {
						new SampleModal(this.app).open();
					}

					return true;
				}
			},
		});

		this.addSettingTab(new SampleSettingTab(this.app, this));

		this.registerDomEvent(document, "click", (evt: MouseEvent) => {
			console.log("click", evt);
		});

		this.registerInterval(
			window.setInterval(() => console.log("setInterval"), 5 * 60 * 1000)
		);

		this.registerEvent(
			this.app.vault.on("create", async (file: TFile) => {
				if (this.settings.autoGenerate && file instanceof TFile && file.extension === "md") {
					await this.processFile(file);
				}
			})
		);
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.setText("Woah!");
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: AbbrLinkPlugin;

	constructor(app: App, plugin: AbbrLinkPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Hash Length")
			.setDesc("Length of the generated abbrlink hash")
			.addSlider(slider => slider
				.setLimits(4, 32, 4)
				.setValue(this.plugin.settings.hashLength)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.hashLength = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Skip Existing")
			.setDesc("Skip files that already have an abbrlink")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.skipExisting)
				.onChange(async (value) => {
					this.plugin.settings.skipExisting = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Auto Generate")
			.setDesc("Automatically generate abbrlink for new files")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoGenerate)
				.onChange(async (value) => {
					this.plugin.settings.autoGenerate = value;
					await this.plugin.saveSettings();
				}));
	}
}
