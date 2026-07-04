import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import { clerkMiddleware } from '@clerk/express'

import { placesRouter } from './routes/places.js'
import { usersRouter } from './routes/users.js'
import { recommendationsRouter } from './routes/recommendations.js'
import { visitsRouter } from './routes/visits.js'
import { friendsRouter } from './routes/friends.js'
import { chatRouter } from './routes/chat.js'
import { locationRouter } from './routes/location.js'
import { busynessRouter } from './routes/busyness.js'

const app = express()
const PORT = process.env.PORT ?? 3001

app.use(helmet())
const allowedOrigins = (process.env.FRONTEND_URL ?? 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow non-browser requests (no Origin header), any configured origin,
      // and any localhost port so Vite's auto-incremented dev ports (5174, …) work.
      if (!origin || allowedOrigins.includes(origin) || /^http:\/\/localhost:\d+$/.test(origin)) {
        callback(null, true)
      } else {
        callback(new Error(`Not allowed by CORS: ${origin}`))
      }
    },
  }),
)
app.use(morgan('dev'))
app.use(express.json())
app.use(clerkMiddleware())

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.use('/api/places', placesRouter)
app.use('/api/users', usersRouter)
app.use('/api/recommendations', recommendationsRouter)
app.use('/api/visits', visitsRouter)
app.use('/api/friends', friendsRouter)
app.use('/api/chat', chatRouter)
app.use('/api/location', locationRouter)
app.use('/api/busyness', busynessRouter)

app.use(
  (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  },
)

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})

export default app
