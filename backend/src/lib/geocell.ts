import { config } from '../config.js'

/** Fixed-grid geo-cell identifiers used by the live-fetch throttle scheduler (§2.2.1). */

export interface Bounds {
  north: number
  south: number
  east: number
  west: number
}

export function cellIdFor(lat: number, lng: number): string {
  const size = config.geoCellSizeDeg
  const latIdx = Math.floor(lat / size)
  const lngIdx = Math.floor(lng / size)
  return `g${latIdx}:${lngIdx}`
}

export function cellCenter(cellId: string): { lat: number; lng: number } {
  const size = config.geoCellSizeDeg
  const [latIdx, lngIdx] = cellId.slice(1).split(':').map(Number)
  return { lat: (latIdx + 0.5) * size, lng: (lngIdx + 0.5) * size }
}

/** Radius (meters) that covers a whole cell from its center */
export function cellRadiusMeters(): number {
  // half-diagonal of the cell, worst case at equator
  const sizeMeters = config.geoCellSizeDeg * 111_320
  return Math.ceil((sizeMeters * Math.SQRT2) / 2)
}

export function cellsForBounds(bounds: Bounds, maxCells = 25): string[] {
  const size = config.geoCellSizeDeg
  const latStart = Math.floor(bounds.south / size)
  const latEnd = Math.floor(bounds.north / size)
  const lngStart = Math.floor(bounds.west / size)
  const lngEnd = Math.floor(bounds.east / size)
  const cells: string[] = []
  for (let la = latStart; la <= latEnd; la++) {
    for (let lo = lngStart; lo <= lngEnd; lo++) {
      cells.push(`g${la}:${lo}`)
      if (cells.length >= maxCells) return cells
    }
  }
  return cells
}

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371e3
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}
