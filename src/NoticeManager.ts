import { Notice } from 'obsidian'

export interface NoticeOptions {
	timeout?: number
}

export const ProcessStep = {
	BUILD_TASK_LIST: 1,
	CHECK_COLLISION: 2,
	RESOLVE_COLLISION: 3
} as const

export type ProcessStepType = (typeof ProcessStep)[keyof typeof ProcessStep]

export class NoticeManager {
	private static readonly TOTAL_STEPS = 3

	private static formatStepMessage(
		step: ProcessStepType,
		message: string
	): string {
		return `步骤 ${step}/${this.TOTAL_STEPS}：${message}`
	}

	static showStepStatus(
		step: ProcessStepType,
		message: string,
		options?: NoticeOptions
	): void {
		new Notice(this.formatStepMessage(step, message), options?.timeout)
	}

	static showProcessingStatus(
		newLinksCount: number,
		updateLinksCount: number,
		step: ProcessStepType,
		options?: NoticeOptions
	): void {
		let message = ''
		if (newLinksCount > 0) {
			message += `正在为 ${newLinksCount} 个文件生成链接`
		}
		if (updateLinksCount > 0) {
			message += `${newLinksCount > 0 ? '，' : ''}正在更新 ${updateLinksCount} 个不一致长度的链接`
		}
		new Notice(
			this.formatStepMessage(step, message + '...'),
			options?.timeout
		)
	}

	static showCollisionCheckStatus(
		checkCount: number,
		maxChecks: number
	): void {
		this.showStepStatus(
			ProcessStep.CHECK_COLLISION,
			`正在检查 Abbrlink 冲突... (第 ${checkCount}/${maxChecks} 轮)`
		)
	}

	static showCollisionResolutionStatus(
		checkCount: number,
		conflictsCount: number
	): void {
		if (conflictsCount === 0) {
			this.showStepStatus(
				ProcessStep.RESOLVE_COLLISION,
				`第 ${checkCount} 轮检查未发现冲突`
			)
		} else {
			this.showStepStatus(
				ProcessStep.CHECK_COLLISION,
				`第 ${checkCount} 轮检查发现 ${conflictsCount} 处冲突`
			)
			this.showStepStatus(
				ProcessStep.RESOLVE_COLLISION,
				`正在解决第 ${checkCount} 轮冲突...`
			)
		}
	}

	static showCollisionWarning(
		checkCount: number,
		conflicts: number,
		currentLength: number,
		suggestedLength: number
	): void {
		new Notice(
			`警告：经过 ${checkCount} 轮检查后仍存在 ${conflicts} 处冲突。\n\n` +
				'建议采取以下措施：\n' +
				`1. 增加 Abbrlink 长度（当前：${currentLength}，建议：${suggestedLength}）\n` +
				'2. 减少文章数量\n' +
				'3. 增加最大检查次数\n\n' +
				'您可以在插件设置中调整这些选项。',
			10000
		)
	}
}
