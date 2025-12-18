import { useState } from 'react'
import { ClipboardDocumentIcon, CheckIcon } from '@heroicons/react/24/outline'

interface ShareButtonProps {
  url: string
}

export default function ShareButton({ url }: ShareButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback for older browsers
      const textarea = document.createElement('textarea')
      textarea.value = url
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-[var(--btn-active-text)] hover:opacity-90 transition-colors"
    >
      {copied ? (
        <>
          <CheckIcon className="h-5 w-5" />
          Copied!
        </>
      ) : (
        <>
          <ClipboardDocumentIcon className="h-5 w-5" />
          Share Result
        </>
      )}
    </button>
  )
}
