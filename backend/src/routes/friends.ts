import { Router } from 'express'

export const friendsRouter = Router()

friendsRouter.get('/', (_req, res) => {
  res.status(501).json({ message: 'Not implemented' })
})
