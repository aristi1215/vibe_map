import { Router } from 'express'

export const visitsRouter = Router()

visitsRouter.post('/', (_req, res) => {
  res.status(501).json({ message: 'Not implemented' })
})
