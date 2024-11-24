import { App, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian'
import { NoticeManager, ProcessStep } from './NoticeManager'
import { TaskManager, FileTask } from './TaskManager'
import { AbbrLinkSettings } from './types'

const DEFAULT_SETTINGS: AbbrLinkSettings = {
	hashLength: 8,
	skipExisting: true,
	autoGenerate: false,
	useRandomMode: false,
	checkCollision: false,
	maxCollisionChecks: 3,
	overrideDifferentLength: false
}

export default class AbbrLinkPlugin extends Plugin {
	settings: AbbrLinkSettings
	private taskManager: TaskManager

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

	private async processFilesWithCollisionCheck(
		tasks: FileTask[]
	): Promise<void> {
		let checkCount = 0
		let hasConflicts = true
		const currentTasks = [...tasks] // 创建任务副本以跟踪更新

		while (hasConflicts && checkCount < this.settings.maxCollisionChecks) {
			checkCount++

			// 为所有需要处理的任务生成哈希值
			for (const task of currentTasks) {
				if (!task.hash) {
					const hash = await this.generateUniqueHash(task.file)
					task.hash = hash
				}
			}

			NoticeManager.showCollisionCheckStatus(
				checkCount,
				this.settings.maxCollisionChecks
			)
			const conflicts =
				await this.taskManager.findHashConflicts(currentTasks)

			if (conflicts.length === 0) {
				// 没有冲突时，写入所有哈希值
				await Promise.all(
					currentTasks.map((task) =>
						this.app.fileManager.processFrontMatter(
							task.file,
							(frontmatter) => {
								frontmatter.abbrlink = task.hash
							}
						)
					)
				)

				NoticeManager.showCollisionResolutionStatus(checkCount, 0)
				hasConflicts = false
				return
			}

			NoticeManager.showCollisionResolutionStatus(
				checkCount,
				conflicts.length
			)
			await this.resolveConflicts(currentTasks)
			NoticeManager.showCollisionResolutionStatus(checkCount, 0)

			if (
				checkCount === this.settings.maxCollisionChecks &&
				conflicts.length > 0
			) {
				const currentLength = this.settings.hashLength
				const suggestedLength = Math.min(currentLength + 4, 32)

				NoticeManager.showCollisionWarning(
					checkCount,
					conflicts.length,
					currentLength,
					suggestedLength
				)

				console.log('Abbrlink 冲突详细信息：')
				conflicts.forEach((conflict, index) => {
					console.log(`冲突组 ${index + 1}：`)
					console.log('Abbrlink：', conflict.hash)
					console.log('冲突文件：')
					conflict.files.forEach((file) => {
						console.log(`- ${file.path}`)
					})
				})
			}
		}
	}

	private async processFilesWithoutCollisionCheck(
		tasks: FileTask[]
	): Promise<void> {
		await Promise.all(tasks.map((task) => this.processFile(task.file)))
	}

	private async resolveConflicts(tasks: FileTask[]): Promise<void> {
		const usedHashes = new Set(
			tasks.map((task) => task.hash).filter(Boolean)
		)

		const conflicts = await this.taskManager.findHashConflicts(tasks)
		if (conflicts.length === 0) return

		new Notice(`发现 ${conflicts.length} 处 Abbrlink 冲突，正在解决...`)

		for (const conflict of conflicts) {
			// 按创建时间排序，最旧的在前面
			const sortedFiles = conflict.files.sort(
				(a, b) => a.stat.ctime - b.stat.ctime
			)

			for (let i = 1; i < sortedFiles.length; i++) {
				const file = sortedFiles[i]
				let newHash: string
				do {
					newHash = await this.generateRandomHash()
				} while (usedHashes.has(newHash))

				// 更新任务列表中的哈希值
				const task = tasks.find((t) => t.file.path === file.path)
				if (task) {
					task.hash = newHash
				}
			}
		}

		new Notice('Abbrlink 冲突已解决！')
	}

	private async processFiles(): Promise<void> {
		NoticeManager.showStepStatus(
			ProcessStep.BUILD_TASK_LIST,
			'正在构建任务列表...'
		)

		const allTasks = await this.taskManager.buildTaskList()
		const tasksToProcess = this.taskManager.filterTasksToProcess(allTasks)

		const newLinksCount = tasksToProcess.filter(
			(task) => !task.hasAbbrlink
		).length
		const updateLinksCount = tasksToProcess.filter(
			(task) => task.needsLengthUpdate
		).length

		NoticeManager.showProcessingStatus(
			newLinksCount,
			updateLinksCount,
			ProcessStep.CHECK_COLLISION
		)

		if (this.settings.checkCollision) {
			await this.processFilesWithCollisionCheck(tasksToProcess)
		} else {
			await this.processFilesWithoutCollisionCheck(tasksToProcess)
		}

		new Notice('完成！')
	}

	async onload() {
		await this.loadSettings()
		this.taskManager = new TaskManager(
			this.app.vault,
			this.settings,
			this.getExistingAbbrlink.bind(this)
		)

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
				'Abbrlink 的长度 (1-32)。' +
					'如果经常发生冲突，建议增加 Abbrlink 长度。' +
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
			.setName('冲突检查')
			.setDesc('当检测到 Abbrlink 冲突时，自动切换到随机模式重新生成')
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

		new Setting(containerEl)
			.setName('覆盖不同长度的链接')
			.setDesc('当文件的链接长度与当前设置不一时，重新生成该链接')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.overrideDifferentLength)
					.onChange(async (value) => {
						this.plugin.settings.overrideDifferentLength = value
						await this.plugin.saveSettings()
					})
			)
	}
}

export class HashGenerator {
	private readonly settings: AbbrLinkSettings

	constructor(settings: AbbrLinkSettings) {
		this.settings = settings
	}

	async generateRandomHash(): Promise<string> {
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

	async generateSha256(str: string): Promise<string> {
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

	async generateUniqueHash(file: TFile): Promise<string> {
		return await this.generateSha256(file.basename)
	}
}
