import { App, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian'
import * as crypto from 'crypto'

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
	checkCollision: true
}

export default class AbbrLinkPlugin extends Plugin {
	settings: AbbrLinkSettings

	private generateRandomHash(): string {
		const keyPair = crypto.generateKeyPairSync('ed25519')
		const publicKey = keyPair.publicKey.export({
			type: 'spki',
			format: 'der'
		})
		return crypto
			.createHash('sha256')
			.update(publicKey)
			.digest('hex')
			.substring(0, this.settings.hashLength)
	}

	private generateSha256(str: string): string {
		if (this.settings.useRandomMode) {
			return this.generateRandomHash()
		}
		return crypto
			.createHash('sha256')
			.update(str)
			.digest('hex')
			.substring(0, this.settings.hashLength)
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
		let hash = this.generateSha256(file.basename)

		if (
			this.settings.checkCollision &&
			(await this.isHashExisting(hash, file))
		) {
			console.log(
				`Hash collision detected for ${file.path}, using random mode`
			)
			do {
				hash = this.generateRandomHash()
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

	async onload() {
		await this.loadSettings()

		this.addRibbonIcon(
			'link',
			'Generate Abbrlinks',
			async (evt: MouseEvent) => {
				try {
					new Notice('Processing files...')
					const files = this.app.vault.getMarkdownFiles()
					await Promise.all(
						files.map((file) => this.processFile(file))
					)
					new Notice('Abbrlinks generated successfully!')
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

		new Setting(containerEl).setName('常规').setHeading()

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
			.setDesc('如果文件已经包含缩略链接，则跳过处理')
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
			.setDesc('为新创建的 Markdown 文件自动生成缩略链接')
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
			.setDesc(
				'使用随机生成的 SHA256 哈希值作为缩略链接，而不是基于文件名生成'
			)
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
