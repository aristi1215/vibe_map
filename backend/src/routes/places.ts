import { Router } from 'express'

export const placesRouter = Router()

placesRouter.get('/', (_req, res) => {
  res.status(501).json({ message: 'Not implemented' })
})
