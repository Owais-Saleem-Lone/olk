export function dueDaysLeft(handedOverAt: string | null, months: number | null): number | null {
  if (!handedOverAt || !months) return null
  const due = new Date(handedOverAt)
  due.setMonth(due.getMonth() + months)
  return Math.floor((due.getTime() - Date.now()) / 86_400_000)
}
