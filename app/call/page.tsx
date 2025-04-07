import { Suspense } from "react"
import CallPageClient from "./call-page-client"

export default function CallPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <CallPageClient />
    </Suspense>
  )
}

