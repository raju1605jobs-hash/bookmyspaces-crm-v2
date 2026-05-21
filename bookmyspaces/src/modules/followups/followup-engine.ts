export function getFollowUpCadence(
  temperature: 'HOT' | 'WARM' | 'COLD',
  followUpCount: number
): number | null {
  const cadenceMap = {
    HOT: [2, 12, 24],
    WARM: [24, 72],
    COLD: [168], // 7 days
  }

  const cadence =
    cadenceMap[temperature][followUpCount]

  return cadence ?? null
}