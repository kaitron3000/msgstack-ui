export async function requestPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  const result = await Notification.requestPermission()
  return result === 'granted'
}

export function showNotification(title: string, body: string, icon?: string) {
  if (typeof window === 'undefined') return
  if (Notification.permission !== 'granted') return
  if (document.hasFocus()) return  // don't notify if tab is active

  const n = new Notification(title, {
    body,
    icon: icon ?? '/favicon.ico',
    badge: '/favicon.ico',
    tag: title,
  })
  n.onclick = () => { window.focus(); n.close() }
}
