import { collection, getDocs } from 'firebase/firestore'
import { db } from './config'

// In-memory cache — the cities collection is read-heavy and rarely changes.
let _cache = null
let _inflight = null

/**
 * Returns the full list of city names from Firestore, sorted in Hebrew.
 * Cached for the session — subsequent calls are free.
 */
export const getCities = async () => {
  if (_cache) return _cache
  if (_inflight) return _inflight

  _inflight = (async () => {
    const snap = await getDocs(collection(db, 'cities'))
    const names = snap.docs
      .map(d => d.data()?.name)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'he'))
    _cache = names
    _inflight = null
    return names
  })()

  return _inflight
}

/**
 * Filter cached cities by query. Loads if not yet cached.
 * Empty query returns the full list.
 */
export const searchCities = async (query) => {
  const all = await getCities()
  const q = (query || '').trim()
  if (!q) return all
  return all.filter(name => name.includes(q))
}

/** Clear the in-memory cache (e.g. after a reload). */
export const invalidateCitiesCache = () => { _cache = null }
