import { Notice } from 'obsidian'

export interface NoticeOptions {
	timeout?: number
}

export const ProcessStep = {
	PROCESSING: 1,
	COLLISION: 2
} as const

export type ProcessStepType = (typeof ProcessStep)[keyof typeof ProcessStep]

export class NoticeManager {
	static showProcessingStatus(
		newLinksCount: number,
		updateLinksCount: number,
		options?: NoticeOptions
	): void {
		let message = ''
		if (newLinksCount > 0) {
			message += `处理中：${newLinksCount} 个新链接`
		}
		if (updateLinksCount > 0) {
			message += `${newLinksCount > 0 ? '，' : ''}${updateLinksCount} 个更新`
		}
		new Notice(message + '...', options?.timeout)
	}

	static showCollisionStatus(
		_checkCount: number,
		conflictsCount: number
	): void {
		if (conflictsCount > 0) {
			new Notice(`发现 ${conflictsCount} 处冲突，正在解决...`)
		}
	}

	static showCollisionWarning(
		conflicts: number,
		currentLength: number,
		suggestedLength: number
	): void {
		new Notice(
			`警告：仍存在 ${conflicts} 处冲突。\n` +
				`建议将链接长度从 ${currentLength} 增加到 ${suggestedLength}，` +
				`或减少文章数量。`,
			8000
		)
	}
}
