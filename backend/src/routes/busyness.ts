import { Router } from 'express'

export const busynessRouter = Router()

busynessRouter.get('/:placeId', (_req, res) => {
  res.status(501).json({ message: 'Not implemented' })
})

busynessRouter.post('/report', (_req, res) => {
  res.status(501).json({ message: 'Not implemented' })
})
