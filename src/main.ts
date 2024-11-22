import { App, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian'

interface AbbrLinkSettings {
	hashLength: number
	skipExisting: boolean
	autoGenerate: boolean
	useRandomMode: boolean
	checkCollision: boolean
}

const DEFAULT_SETTINGS: AbbrLinkSettings = {
	hashLength: 8,
	skipExisting: true,
	autoGenerate: false,
	useRandomMode: false,
	checkCollision: false
}

interface FileTask {
	file: TFile
	hasAbbrlink: boolean
}

export default class AbbrLinkPlugin extends Plugin {
	settings: AbbrLinkSettings

	private async generateRandomHash(): Promise<string> {
		const randomBytes = new Uint8Array(32)
		window.crypto.getRandomValues(randomBytes)

		const hashBuffer = await window.crypto.subtle.digest(
			'SHA-256',
			randomBytes
		)
		const hashArray = Array.from(new Uint8Array(hashBuffer))
		const hashHex = hashArray
			.map((b) => b.toString(16).padStart(2, '0'))
			.join('')

		return hashHex.substring(0, this.settings.hashLength)
	}

	private async generateSha256(str: string): Promise<string> {
		if (this.settings.useRandomMode) {
			return await this.generateRandomHash()
		}

		const encoder = new window.TextEncoder()
		const data = encoder.encode(str)

		const hashBuffer = await window.crypto.subtle.digest('SHA-256', data)
		const hashArray = Array.from(new Uint8Array(hashBuffer))
		const hashHex = hashArray
			.map((b) => b.toString(16).padStart(2, '0'))
			.join('')

		return hashHex.substring(0, this.settings.hashLength)
	}

	private async getExistingAbbrlink(content: string): Promise<string | null> {
		const match = content.match(
			new RegExp(
				`abbrlink:\\s*([a-fA-F0-9]{${this.settings.hashLength}})`
			)
		)
		return match ? match[1] : null
	}

	private async isHashExisting(
		hash: string,
		currentFile: TFile
	): Promise<boolean> {
		const files = this.app.vault.getMarkdownFiles()
		const fileContents = await Promise.all(
			files.map((file) => this.app.vault.read(file))
		)

		for (let i = 0; i < files.length; i++) {
			const file = files[i]
			if (file.path === currentFile.path) continue

			const existingHash = await this.getExistingAbbrlink(fileContents[i])
			if (existingHash === hash) {
				return true
			}
		}
		return false
	}

	private async generateUniqueHash(file: TFile): Promise<string> {
		let hash = await this.generateSha256(file.basename)

		if (
			this.settings.checkCollision &&
			(await this.isHashExisting(hash, file))
		) {
			console.log(
				`Hash collision detected for ${file.path}, using random mode`
			)
			do {
				hash = await this.generateRandomHash()
			} while (await this.isHashExisting(hash, file))
		}

		return hash
	}

	private async processFile(file: TFile): Promise<void> {
		try {
			const content = await this.app.vault.read(file)

			if (content.includes('abbrlink:') && this.settings.skipExisting) {
				return
			}

			const abbrlink = await this.generateUniqueHash(file)

			await this.app.fileManager.processFrontMatter(
				file,
				(frontmatter) => {
					frontmatter.abbrlink = abbrlink
				}
			)
		} catch (error) {
			console.error(`Error processing file ${file.path}:`, error)
			throw error
		}
	}

	private async buildTaskList(): Promise<FileTask[]> {
		const files = this.app.vault.getMarkdownFiles()
		const tasks: FileTask[] = []

		for (const file of files) {
			const content = await this.app.vault.read(file)
			const hasAbbrlink = content.includes('abbrlink:')

			if (!hasAbbrlink || !this.settings.skipExisting) {
				tasks.push({ file, hasAbbrlink })
			}
		}

		return tasks
	}

	private async processFiles(): Promise<void> {
		new Notice('Building task list...')
		const tasks = await this.buildTaskList()

		if (tasks.length === 0) {
			new Notice('No files need to be processed!')
			return
		}

		new Notice(`Processing ${tasks.length} files...`)
		await Promise.all(tasks.map((task) => this.processFile(task.file)))
		new Notice('Abbrlinks generated successfully!')
	}

	async onload() {
		await this.loadSettings()

		this.addRibbonIcon(
			'link',
			'Generate Abbrlinks',
			async (evt: MouseEvent) => {
				try {
					await this.processFiles()
				} catch (error) {
					new Notice('Error generating abbrlinks!')
					console.error(error)
				}
			}
		)

		this.addSettingTab(new SampleSettingTab(this.app, this))

		this.registerEvent(
			this.app.vault.on('create', async (file: TFile) => {
				if (
					this.settings.autoGenerate &&
					file instanceof TFile &&
					file.extension === 'md'
				) {
					const originalRandomMode = this.settings.useRandomMode
					this.settings.useRandomMode = true
					await this.processFile(file)
					this.settings.useRandomMode = originalRandomMode
				}
			})
		)
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		)
	}

	async saveSettings() {
		await this.saveData(this.settings)
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: AbbrLinkPlugin

	constructor(app: App, plugin: AbbrLinkPlugin) {
		super(app, plugin)
		this.plugin = plugin
	}

	display(): void {
		const { containerEl } = this
		containerEl.empty()

		new Setting(containerEl)
			.setName('Abbrlink 长度')
			.setDesc('Abbrlink 长度 (4-32)')
			.addSlider((slider) =>
				slider
					.setLimits(4, 32, 4)
					.setValue(this.plugin.settings.hashLength)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.hashLength = value
						await this.plugin.saveSettings()
					})
			)

		new Setting(containerEl).setName('自动化').setHeading()

		new Setting(containerEl)
			.setName('跳过已有链接')
			.setDesc('如果文件已经包含 Abbrlink，则跳过')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.skipExisting)
					.onChange(async (value) => {
						this.plugin.settings.skipExisting = value
						await this.plugin.saveSettings()
					})
			)

		new Setting(containerEl)
			.setName('自动生成')
			.setDesc('为新创建的 Markdown 文件自动生成 Abbrlink')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoGenerate)
					.onChange(async (value) => {
						this.plugin.settings.autoGenerate = value
						await this.plugin.saveSettings()
					})
			)

		new Setting(containerEl).setName('高级选项').setHeading()

		new Setting(containerEl)
			.setName('随机模式')
			.setDesc('使用随机生成的 SHA256 作为 Abbrlink')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.useRandomMode)
					.onChange(async (value) => {
						this.plugin.settings.useRandomMode = value
						await this.plugin.saveSettings()
					})
			)

		new Setting(containerEl)
			.setName('检查哈希冲突')
			.setDesc('当检测到哈希值冲突时，自动切换到随机模式重新生成')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.checkCollision)
					.onChange(async (value) => {
						this.plugin.settings.checkCollision = value
						await this.plugin.saveSettings()
					})
			)
	}
}
