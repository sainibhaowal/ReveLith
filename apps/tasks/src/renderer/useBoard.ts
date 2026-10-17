import { useCallback, useSyncExternalStore } from 'react'
import type { BoardState } from '../domain/types'
import type { Action } from '../store/actions'
import type { BoardStore } from '../store/store'

/** Subscribe a component to the board store. */
export function useBoard(store: BoardStore): BoardState {
  return useSyncExternalStore(
    useCallback((onChange: () => void) => store.subscribe(onChange), [store]),
    useCallback(() => store.getState(), [store]),
    useCallback(() => store.getState(), [store]),
  )
}

/** Dispatch helper that reads naturally at call sites. */
export function useDispatch(store: BoardStore) {
  return useCallback((action: Action) => store.dispatch(action), [store])
}
