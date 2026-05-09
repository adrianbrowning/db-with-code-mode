import { Fragment } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import type { TextProps } from '#/lib/reports/types'

const variantClasses = {
  h1: 'text-3xl font-bold',
  h2: 'text-2xl font-semibold',
  h3: 'text-xl font-semibold',
  body: 'text-base',
  caption: 'text-sm',
  code: 'font-mono text-sm bg-sky-100/60 text-slate-700 px-1.5 py-0.5 rounded border border-sky-200/50',
}

const colorClasses = {
  default: 'text-[var(--report-text)]',
  muted: 'text-[var(--report-text-muted)]',
  accent: 'text-[var(--report-accent)]',
  success: 'text-[var(--report-success)]',
  warning: 'text-[var(--report-warning)]',
  error: 'text-[var(--report-error)]',
}

const alignClasses = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
}

// We render markdown inline inside a single variant tag (h1/h2/h3/p), so any
// block-level wrappers ReactMarkdown emits get flattened to fragments. Inline
// nodes (strong, em, code, a) keep their tags and inherit the parent styling.
const inlineMarkdownComponents = {
  p: ({ children }: { children?: React.ReactNode }) => <Fragment>{children}</Fragment>,
  h1: ({ children }: { children?: React.ReactNode }) => <Fragment>{children}</Fragment>,
  h2: ({ children }: { children?: React.ReactNode }) => <Fragment>{children}</Fragment>,
  h3: ({ children }: { children?: React.ReactNode }) => <Fragment>{children}</Fragment>,
  h4: ({ children }: { children?: React.ReactNode }) => <Fragment>{children}</Fragment>,
  h5: ({ children }: { children?: React.ReactNode }) => <Fragment>{children}</Fragment>,
  h6: ({ children }: { children?: React.ReactNode }) => <Fragment>{children}</Fragment>,
  a: ({ children, href }: { children?: React.ReactNode; href?: string }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[var(--report-accent)] underline underline-offset-2 hover:opacity-80"
    >
      {children}
    </a>
  ),
  code: ({ children }: { children?: React.ReactNode }) => (
    <code className="font-mono text-[0.95em] bg-sky-100/60 text-slate-700 px-1 py-0.5 rounded border border-sky-200/50">
      {children}
    </code>
  ),
}

export function Text({
  content,
  variant = 'body',
  color = 'default',
  align = 'left',
}: TextProps) {
  const Tag =
    variant === 'h1'
      ? 'h1'
      : variant === 'h2'
        ? 'h2'
        : variant === 'h3'
          ? 'h3'
          : 'p'

  return (
    <Tag
      className={`${variantClasses[variant]} ${colorClasses[color]} ${alignClasses[align]}`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={inlineMarkdownComponents}
      >
        {content}
      </ReactMarkdown>
    </Tag>
  )
}
