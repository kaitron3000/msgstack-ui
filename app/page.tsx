'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useStore } from '@/lib/store'

export default function Home() {
  const router = useRouter()
  const { accessToken } = useStore()

  useEffect(() => {
    router.replace(accessToken ? '/chat' : '/login')
  }, [accessToken, router])

  return (
    <div className="min-h-screen bg-[#313338] flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
