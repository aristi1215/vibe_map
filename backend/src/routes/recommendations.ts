import { Router } from 'express'

export const recommendationsRouter = Router()

recommendationsRouter.get('/', (_req, res) => {
  res.status(501).json({ message: 'Not implemented' })
})
