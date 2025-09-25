import type { TFile, Vault } from 'obsidian'
import type { AbbrLinkSettings } from './types'

export interface FileTask {
  file: TFile
  hasAbbrlink: boolean
  hash?: string
  needsLengthUpdate: boolean
}

export interface HashConflict {
  hash: string
  files: TFile[]
}

export class TaskManager {
  readonly #vault: Vault
  readonly #settings: AbbrLinkSettings
  readonly #getExistingAbbrlink: (content: string) => Promise<string | null>

  constructor(
    vault: Vault,
    settings: AbbrLinkSettings,
    getExistingAbbrlink: (content: string) => Promise<string | null>
  ) {
    this.#vault = vault
    this.#settings = settings
    this.#getExistingAbbrlink = getExistingAbbrlink
  }

  async buildTaskList(): Promise<FileTask[]> {
    const files = this.#vault.getMarkdownFiles()
    const tasks = await Promise.all(
      files.map(async (file) => {
        const content = await this.#vault.read(file)
        const hash = await this.#getExistingAbbrlink(content)
        const hasAbbrlink = !!hash
        const needsLengthUpdate = !!(
          hash && hash.length !== this.#settings.hashLength
        )

        return {
          file,
          hasAbbrlink,
          hash: hash || undefined,
          needsLengthUpdate
        }
      })
    )

    return tasks
  }

  async findHashConflicts(tasks: FileTask[]): Promise<HashConflict[]> {
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

  filterTasksToProcess(allTasks: FileTask[]): FileTask[] {
    return this.#settings.skipExisting
      ? allTasks.filter(
          (task) =>
            !task.hasAbbrlink ||
            (this.#settings.overrideDifferentLength && task.needsLengthUpdate)
        )
      : allTasks
  }
}
