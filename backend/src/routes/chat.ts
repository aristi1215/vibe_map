import { Router } from 'express'

export const chatRouter = Router()

chatRouter.get('/', (_req, res) => {
  res.status(501).json({ message: 'Not implemented' })
})
