import { createFileRoute } from '@tanstack/react-router'

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore – path literal is required by TanStack Router Vite plugin; routeTree.gen.ts overrides this type
export const Route = createFileRoute('/')({
  component: IndexPage,
})

function IndexPage() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-950 text-white">
      <h1 className="text-4xl font-bold">Vibe Map</h1>
    </div>
  )
}
