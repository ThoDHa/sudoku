import { Disclosure } from '@headlessui/react'
import { ChevronUpIcon } from '@heroicons/react/24/solid'
import { getTechniqueDisplayName } from '../lib/techniques'

interface TechniqueBreakdownProps {
  summary: Record<string, number>
}

export default function TechniqueBreakdown({ summary }: TechniqueBreakdownProps) {
  const entries = Object.entries(summary).sort((a, b) => b[1] - a[1])

  if (entries.length === 0) {
    return null
  }

  return (
    <Disclosure>
      {({ open }) => (
        <div className="mt-6 w-full max-w-md rounded-xl bg-[var(--bg-secondary)] shadow">
          <Disclosure.Button className="flex w-full items-center justify-between rounded-xl px-4 py-3 text-left text-sm font-medium text-[var(--text)] hover:bg-[var(--btn-hover)] focus:outline-none focus-visible:ring focus-visible:ring-[var(--accent)]">
            <span>Technique Breakdown</span>
            <ChevronUpIcon
              className={`h-5 w-5 text-[var(--text-muted)] transition-transform ${
                open ? 'rotate-180' : ''
              }`}
            />
          </Disclosure.Button>
          <Disclosure.Panel className="px-4 pb-4">
            <ul className="divide-y divide-[var(--border-light)]">
              {entries.map(([key, count]) => (
                <li key={key} className="flex justify-between py-2">
                  <span className="text-[var(--text)]">
                    {getTechniqueDisplayName(key)}
                  </span>
                  <span className="font-medium text-[var(--accent)]">{count}</span>
                </li>
              ))}
            </ul>
          </Disclosure.Panel>
        </div>
      )}
    </Disclosure>
  )
}
