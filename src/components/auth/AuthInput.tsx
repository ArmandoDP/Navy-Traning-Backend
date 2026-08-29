'use client'
import { useState, InputHTMLAttributes } from 'react'
import { Eye, EyeOff } from 'lucide-react'

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label:   string
  error?:  string
}

export default function AuthInput({ label, error, type, ...props }: Props) {
  const [showPass, setShowPass] = useState(false)
  const isPassword = type === 'password'

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <div className="relative">
        <input
          {...props}
          type={isPassword ? (showPass ? 'text' : 'password') : type}
          className={`w-full border rounded-xl px-4 py-3 text-sm text-gray-900 outline-none transition pr-${isPassword ? '11' : '4'}
            ${error
              ? 'border-red-400 bg-red-50 focus:border-red-500 focus:ring-2 focus:ring-red-100'
              : 'border-gray-200 bg-gray-50 focus:border-gray-900 focus:ring-2 focus:ring-gray-100'
            }`}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPass(s => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
          >
            {showPass ? <EyeOff size={16}/> : <Eye size={16}/>}
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
    </div>
  )
}