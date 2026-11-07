import { useId } from 'react'
import {
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Presentation,
  type LucideIcon,
} from 'lucide-react'
import { cx, type FileKind } from '../lib/format'

interface IconProps {
  size?: number
  className?: string
}

/** OneDrive-style cloud mark. */
export function CloudLogo({ size = 24, className }: IconProps) {
  // Unique id per instance — duplicate gradient ids can fail when one
  // instance sits in a display:none subtree (e.g. the hidden desktop sidebar).
  const gradientId = useId()
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2E8AE0" />
          <stop offset="1" stopColor="#0F6CBD" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${gradientId})`}
        d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96Z"
      />
    </svg>
  )
}

/** Two-tone amber folder, Fluent flavoured. */
export function FolderGlyph({ size = 20, className }: IconProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      width={size}
      height={size}
      className={cx('shrink-0', className)}
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#F0A30A"
        d="M2 6.3A2.3 2.3 0 0 1 4.3 4h2.94c.64 0 1.24.32 1.6.85l.51.76c.18.27.48.43.8.43h5.55A2.3 2.3 0 0 1 18 8.34v1.16H2Z"
      />
      <path
        fill="#FFC83D"
        d="M2 8.6h16v5.1A2.3 2.3 0 0 1 15.7 16H4.3A2.3 2.3 0 0 1 2 13.7Z"
      />
    </svg>
  )
}

/* ---------------------------------------------------------------------------
   Filled navigation glyphs (Fluent-style, currentColor)
   --------------------------------------------------------------------------- */

export function HomeFilled({ size = 20, className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} fill="currentColor" className={className} aria-hidden="true">
      <path d="M9.1 2.36a1.35 1.35 0 0 1 1.8 0l6.35 5.7a1 1 0 0 1 .33.74V16a2 2 0 0 1-2 2h-2.83v-4.1a1.15 1.15 0 0 0-1.15-1.15h-3.2A1.15 1.15 0 0 0 7.25 13.9V18H4.42a2 2 0 0 1-2-2V8.8a1 1 0 0 1 .33-.74Z" />
    </svg>
  )
}

export function FolderFilled({ size = 20, className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} fill="currentColor" className={className} aria-hidden="true">
      <path d="M2 6.3A2.3 2.3 0 0 1 4.3 4h2.94c.64 0 1.24.32 1.6.85l.51.76c.18.27.48.43.8.43h5.55A2.3 2.3 0 0 1 18 8.34v5.36A2.3 2.3 0 0 1 15.7 16H4.3A2.3 2.3 0 0 1 2 13.7Z" />
    </svg>
  )
}

export function ClockFilled({ size = 20, className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} fill="currentColor" className={className} aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm.75 3.5a.75.75 0 1 0-1.5 0v4.2c0 .2.08.39.22.53l2.4 2.4a.75.75 0 1 0 1.06-1.06l-2.18-2.18Z"
      />
    </svg>
  )
}

export function PeopleFilled({ size = 20, className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} fill="currentColor" className={className} aria-hidden="true">
      <path d="M13.9 4.1a2.35 2.35 0 1 1 0 4.7 2.35 2.35 0 0 1 0-4.7Z" />
      <path d="M14.3 9.9c2 0 3.6 1.35 3.6 3.1 0 .95-.5 1.7-1.3 2.2-.95-.5-2.05-.8-3.25-.8h-.2c.25-.5.4-1.05.4-1.65 0-1.1-.45-2.1-1.2-2.85h.35c.5 0 .98-.02 1.5-.02Z" />
      <path d="M7.15 3.2a3.1 3.1 0 1 1 0 6.2 3.1 3.1 0 0 1 0-6.2Z" />
      <path d="M7.15 10.4c2.95 0 5.15 1.7 5.15 3.85 0 1.15-.8 1.75-2.25 1.75H4.25C2.8 16 2 15.4 2 14.25 2 12.1 4.2 10.4 7.15 10.4Z" />
    </svg>
  )
}

export function TrashFilled({ size = 20, className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} fill="currentColor" className={className} aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M8.4 2.5c-.83 0-1.5.67-1.5 1.5v.25H4.3a.75.75 0 0 0 0 1.5h.48l.67 10.1a2.5 2.5 0 0 0 2.5 2.34h4.1a2.5 2.5 0 0 0 2.5-2.34l.67-10.1h.48a.75.75 0 0 0 0-1.5h-2.6V4c0-.83-.67-1.5-1.5-1.5H8.4Zm1.35 4.1a.75.75 0 0 1 1.5 0v7.3a.75.75 0 0 1-1.5 0V6.6Zm2.9 0a.75.75 0 0 1 1.5 0v7.3a.75.75 0 0 1-1.5 0V6.6Z"
        transform="translate(-.6 0)"
      />
    </svg>
  )
}

export function ShieldFilled({ size = 20, className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} fill="currentColor" className={className} aria-hidden="true">
      <path d="M9.35 2.34a2 2 0 0 1 1.3 0l5.25 1.95A2 2 0 0 1 17.2 6.16v4.06c0 3.98-2.5 6.94-6.3 8.5a2.2 2.2 0 0 1-1.8 0c-3.8-1.56-6.3-4.52-6.3-8.5V6.16c0-.84.52-1.58 1.3-1.87Z" />
    </svg>
  )
}

/* ---------------------------------------------------------------------------
   File-type glyphs
   --------------------------------------------------------------------------- */

const FILE_GLYPHS: Record<Exclude<FileKind, 'folder'>, { Icon: LucideIcon; color: string }> = {
  doc: { Icon: FileText, color: 'text-[#185ABD] dark:text-[#4F8FD9]' },
  sheet: { Icon: FileSpreadsheet, color: 'text-[#107C10] dark:text-[#4CAF50]' },
  slides: { Icon: Presentation, color: 'text-[#C43E1C] dark:text-[#E8704F]' },
  pdf: { Icon: FileText, color: 'text-[#C50F1F] dark:text-[#E3606E]' },
  image: { Icon: FileImage, color: 'text-[#8764B8] dark:text-[#A98FD9]' },
  video: { Icon: FileVideo, color: 'text-[#C239B3] dark:text-[#D96CC9]' },
  audio: { Icon: FileAudio, color: 'text-[#D83B01] dark:text-[#E8703E]' },
  archive: { Icon: FileArchive, color: 'text-ink-3' },
  code: { Icon: FileCode, color: 'text-[#CA5010] dark:text-[#E08A4F]' },
  text: { Icon: FileText, color: 'text-ink-3' },
  file: { Icon: File, color: 'text-ink-3' },
}

export function FileGlyph({
  kind,
  size = 20,
  className,
}: IconProps & { kind: FileKind }) {
  if (kind === 'folder') return <FolderGlyph size={size} className={className} />
  const { Icon, color } = FILE_GLYPHS[kind] ?? FILE_GLYPHS.file
  return <Icon size={size} strokeWidth={1.75} className={cx('shrink-0', color, className)} aria-hidden="true" />
}
