import { App, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian'

interface AbbrLinkSettings {
	hashLength: number
	skipExisting: boolean
	autoGenerate: boolean
	useRandomMode: boolean
	checkCollision: boolean
	maxCollisionChecks: number
}

const DEFAULT_SETTINGS: AbbrLinkSettings = {
	hashLength: 8,
	skipExisting: true,
	autoGenerate: false,
	useRandomMode: false,
	checkCollision: false,
	maxCollisionChecks: 3
}

interface FileTask {
	file: TFile
	hasAbbrlink: boolean
	hash?: string
}

interface AbbrConflict {
	hash: string
	files: TFile[]
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
		const tasks = await this.buildTaskList()
		return tasks.some(
			(task) => task.hash === hash && task.file.path !== currentFile.path
		)
	}

	private async generateUniqueHash(file: TFile): Promise<string> {
		return await this.generateSha256(file.basename)
	}

	private async processFile(file: TFile): Promise<void> {
		try {
			const content = await this.app.vault.read(file)

			const existingHash = await this.getExistingAbbrlink(content)
			if (existingHash && this.settings.skipExisting) {
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
			const hash = await this.getExistingAbbrlink(content)
			const hasAbbrlink = !!hash

			tasks.push({ file, hasAbbrlink, hash: hash || undefined })
		}

		return tasks
	}

	private async findHashConflicts(
		tasks: FileTask[]
	): Promise<AbbrConflict[]> {
		const hashMap = new Map<string, TFile[]>()

		for (const task of tasks) {
			if (task.hash) {
				const existingFiles = hashMap.get(task.hash) || []
				existingFiles.push(task.file)
				hashMap.set(task.hash, existingFiles)
			}
		}

		return Array.from(hashMap.entries())
			.filter(([_, files]) => files.length > 1)
			.map(([hash, files]) => ({ hash, files }))
	}

	private async resolveConflicts(tasks: FileTask[]): Promise<void> {
		const conflicts = await this.findHashConflicts(tasks)
		if (conflicts.length === 0) return

		new Notice(`发现 ${conflicts.length} 处哈希冲突，正在解决...`)

		for (const conflict of conflicts) {
			const sortedFiles = conflict.files.sort(
				(a, b) => b.stat.ctime - a.stat.ctime
			)

			for (let i = 0; i < sortedFiles.length - 1; i++) {
				const file = sortedFiles[i]
				let newHash: string
				do {
					newHash = await this.generateRandomHash()
				} while (tasks.some((task) => task.hash === newHash))

				await this.app.fileManager.processFrontMatter(
					file,
					(frontmatter) => {
						frontmatter.abbrlink = newHash
					}
				)
			}
		}

		new Notice('Abbrlink 冲突已解决！')
	}

	private async processFiles(): Promise<void> {
		new Notice('正在构建任务列表...')
		const allTasks = await this.buildTaskList()

		const tasksToProcess = this.settings.skipExisting
			? allTasks.filter((task) => !task.hasAbbrlink)
			: allTasks

		if (this.settings.checkCollision) {
			if (tasksToProcess.length === 0) {
				new Notice('Step 1/3：无需生成新的链接')
			} else {
				new Notice(
					`Step 1/3：正在为 ${tasksToProcess.length} 个文件生成链接...`
				)
				await Promise.all(
					tasksToProcess.map((task) => this.processFile(task.file))
				)
				new Notice('Step 1/3：链接生成完成')
			}

			let checkCount = 0
			let hasConflicts = true

			while (
				hasConflicts &&
				checkCount < this.settings.maxCollisionChecks
			) {
				checkCount++

				new Notice(
					`Step 2/3：正在检查哈希冲突... (第 ${checkCount}/${this.settings.maxCollisionChecks} 轮)`
				)
				const updatedTasks = await this.buildTaskList()
				const conflicts = await this.findHashConflicts(updatedTasks)

				if (conflicts.length === 0) {
					new Notice(`Step 2/3：第 ${checkCount} 轮检查未发现冲突`)
					new Notice('Step 3/3：无需解决冲突')
					hasConflicts = false
					return
				}

				new Notice(
					`Step 2/3：第 ${checkCount} 轮检查发现 ${conflicts.length} 处冲突`
				)

				new Notice(`Step 3/3：正在解决第 ${checkCount} 轮冲突...`)
				await this.resolveConflicts(updatedTasks)
				new Notice(`Step 3/3：第 ${checkCount} 轮冲突已解决`)

				if (
					checkCount === this.settings.maxCollisionChecks &&
					conflicts.length > 0
				) {
					const currentLength = this.settings.hashLength
					const suggestedLength = Math.min(currentLength + 4, 32)

					new Notice(
						`警告：经过 ${checkCount} 轮检查后仍存在 ${conflicts.length} 处冲突。\n\n` +
							'建议采取以下措施：\n' +
							`1. 增加链接长度（当前：${currentLength}，建议：${suggestedLength}）\n` +
							'2. 减少文章数量\n' +
							'3. 增加最大检查次数\n\n' +
							'您可以在插件设置中调整这些选项。',
						10000
					)

					console.log('链接冲突详细信息：')
					conflicts.forEach((conflict, index) => {
						console.log(`冲突组 ${index + 1}：`)
						console.log('哈希值：', conflict.hash)
						console.log('冲突文件：')
						conflict.files.forEach((file) => {
							console.log(`- ${file.path}`)
						})
					})
				}
			}
		} else {
			if (tasksToProcess.length === 0) {
				new Notice('无需处理任何文件')
				return
			}

			new Notice(
				`Step 1/1：正在为 ${tasksToProcess.length} 个文件生成链接...`
			)
			await Promise.all(
				tasksToProcess.map((task) => this.processFile(task.file))
			)
			new Notice('Step 1/1：链接生成完成')
		}
	}

	async onload() {
		await this.loadSettings()

		this.addRibbonIcon('link', 'Generate Abbrlinks', async () => {
			try {
				await this.processFiles()
			} catch (error) {
				new Notice('Error generating abbrlinks!')
				console.error(error)
			}
		})

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
			.setName('Abbrlink Length')
			.setDesc(
				'哈希值的长度 (1-32)。' +
					'如果经常发生冲突，建议增加长度。' +
					'长度越长，发生冲突的概率越小。'
			)
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

		new Setting(containerEl)
			.setName('最大冲突检查次数')
			.setDesc('当开启冲突检查时，最多重复检查的次数 (1-10)')
			.addSlider((slider) =>
				slider
					.setLimits(1, 10, 1)
					.setValue(this.plugin.settings.maxCollisionChecks)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.maxCollisionChecks = value
						await this.plugin.saveSettings()
					})
			)
	}
}
