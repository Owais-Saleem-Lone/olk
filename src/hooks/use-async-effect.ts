import { useEffect, type DependencyList } from 'react'

// Shared shape behind the repeated `useEffect(() => { queueMicrotask(() => fetchX()) }, deps)`
// pattern across dashboard pages — runs `effect` once per dependency change, deferred to a
// microtask so it never executes synchronously inside the effect callback.
export function useAsyncEffect(effect: () => void, deps: DependencyList) {
  useEffect(() => {
    queueMicrotask(effect)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
