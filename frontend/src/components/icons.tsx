import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

const base = (props: IconProps) => ({
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  ...props,
})

export const IconSearch = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.2-3.2" />
  </svg>
)

export const IconClose = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
)

export const IconPeople = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M16 19a4 4 0 0 0-8 0" />
    <circle cx="12" cy="8" r="3.2" />
    <path d="M20 18a3.5 3.5 0 0 0-3-3.4M4 18a3.5 3.5 0 0 1 3-3.4" />
  </svg>
)

export const IconSparkle = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
    <path d="M12 8.5 13 11l2.5 1-2.5 1-1 2.5-1-2.5L8.5 12 11 11z" fill="currentColor" stroke="none" />
  </svg>
)

export const IconNav = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 11l18-8-8 18-2-8-8-2z" />
  </svg>
)

export const IconPhone = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6.5 3.5 9 4l1 3-1.6 1.4a12 12 0 0 0 5.2 5.2L15 12l3 1 .5 2.5a2 2 0 0 1-2.2 2.3A15 15 0 0 1 4.2 5.7 2 2 0 0 1 6.5 3.5z" />
  </svg>
)

export const IconGlobe = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
  </svg>
)

export const IconClock = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
)

export const IconPin = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 21s7-5.3 7-11a7 7 0 1 0-14 0c0 5.7 7 11 7 11z" />
    <circle cx="12" cy="10" r="2.4" />
  </svg>
)

export const IconChevron = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m9 6 6 6-6 6" />
  </svg>
)

export const IconStar = (p: IconProps) => (
  <svg {...base({ fill: 'currentColor', stroke: 'none', ...p })}>
    <path d="M12 3.5l2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8z" />
  </svg>
)

export const IconSend = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 12 20 4l-7 16-2-6-7-2z" />
  </svg>
)

export const IconChat = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M20 12a7 7 0 0 1-9.5 6.5L4 20l1.5-4.2A7 7 0 1 1 20 12z" />
  </svg>
)
