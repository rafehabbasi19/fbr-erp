function smoothBehavior() {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return 'smooth'
  }

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  return reduceMotion ? 'auto' : 'smooth'
}

export function scrollToRef(ref) {
  const element = ref?.current

  if (!element) {
    return
  }

  element.scrollIntoView({ behavior: smoothBehavior(), block: 'center' })

  if (typeof element.focus === 'function') {
    element.focus({ preventScroll: true })
  }
}

export function scrollToFirstFieldError(errors, refMap) {
  const firstField = Object.keys(errors || {})[0]

  if (!firstField || !refMap[firstField]) {
    return
  }

  scrollToRef(refMap[firstField])
}
