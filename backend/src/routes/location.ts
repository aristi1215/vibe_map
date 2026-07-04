import { Router } from 'express'

export const locationRouter = Router()

locationRouter.post('/share', (_req, res) => {
  res.status(501).json({ message: 'Not implemented' })
})
