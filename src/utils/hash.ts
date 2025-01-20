import { TFile } from 'obsidian'
import { AbbrLinkSettings } from '../types'

function hexToDecimal(hex: string, maxLength: number): string {
	const decimal = BigInt(`0x${hex}`).toString()
	if (decimal.length < maxLength) {
		return decimal.padStart(maxLength, '0')
	}
	return decimal.slice(0, maxLength)
}

export async function generateRandomHash(hashLength: number, useDecimal: boolean = false): Promise<string> {
	const randomBytes = new Uint8Array(32)
	window.crypto.getRandomValues(randomBytes)

	const hashBuffer = await window.crypto.subtle.digest('SHA-256', randomBytes)
	const hashArray = Array.from(new Uint8Array(hashBuffer))
	const hashHex = hashArray
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('')

	if (useDecimal) {
		return hexToDecimal(hashHex, hashLength)
	}
	return hashHex.substring(0, hashLength)
}

export async function generateSha256(
	str: string,
	settings: AbbrLinkSettings
): Promise<string> {
	if (settings.useRandomMode) {
		return await generateRandomHash(settings.hashLength, settings.useDecimal)
	}

	const encoder = new window.TextEncoder()
	const data = encoder.encode(str)

	const hashBuffer = await window.crypto.subtle.digest('SHA-256', data)
	const hashArray = Array.from(new Uint8Array(hashBuffer))
	const hashHex = hashArray
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('')

	if (settings.useDecimal) {
		return hexToDecimal(hashHex, settings.hashLength)
	}
	return hashHex.substring(0, settings.hashLength)
}

export async function generateUniqueHash(
	file: TFile,
	settings: AbbrLinkSettings
): Promise<string> {
	return await generateSha256(file.basename, settings)
}

export async function getExistingAbbrlink(
	content: string,
	hashLength: number,
	useDecimal: boolean = false
): Promise<string | null> {
	const pattern = useDecimal 
		? `abbrlink:\\s*(\\d{1,${hashLength}})`
		: `abbrlink:\\s*([a-fA-F0-9]{${hashLength}})`
	const match = content.match(new RegExp(pattern))
	return match ? match[1] : null
}
