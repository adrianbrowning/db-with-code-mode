import { Link } from '@tanstack/react-router'
import { Compass } from 'lucide-react'

export function NotFound() {
  return (
    <div className="flex h-screen items-center justify-center bg-gray-900">
      <div className="text-center max-w-md">
        <Compass size={48} className="mx-auto mb-4 text-purple-400/50" />
        <p className="text-6xl font-bold mb-3 text-white">404</p>
        <p className="text-sm text-gray-400 mb-6">Page not found</p>
        <Link
          to="/"
          className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition-colors"
        >
          Go home
        </Link>
      </div>
    </div>
  )
}