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

// Remember to rename these classes and interfaces!

interface MyPluginSettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: "default",
};

export default class AbbrLinkPlugin extends Plugin {
	settings: MyPluginSettings;

	private generateSha256(str: string): string {
		return crypto
			.createHash("sha256")
			.update(str)
			.digest("hex")
			.substring(0, 8);
	}

	private async processFile(file: TFile): Promise<void> {
		const content = await this.app.vault.read(file);

		if (content.includes("abbrlink:")) {
			return;
		}

		const abbrlink = this.generateSha256(file.basename);

		let newContent = "";
		if (content.startsWith("---")) {
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			const [_, ...rest] = content.split("---\n");
			newContent = `---\nabbrlink: ${abbrlink}\n${rest.join("---\n")}`;
		} else {
			newContent = `---\nabbrlink: ${abbrlink}\n---\n${content}`;
		}

		await this.app.vault.modify(file, newContent);
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
			.setName("Setting #1")
			.setDesc("It's a secret")
			.addText((text) =>
				text
					.setPlaceholder("Enter your secret")
					.setValue(this.plugin.settings.mySetting)
					.onChange(async (value) => {
						this.plugin.settings.mySetting = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
