import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { lazy, Suspense } from "react"
import { ThemeProvider } from "./components/ThemeProvider"
import { StoreAuthProvider } from "./store/contexts/StoreAuthContext"
import { PageViewTracker } from "./store/components/PageViewTracker"
import { Toaster } from "sonner"
import { PageSkeleton } from "./components/skeletons/PageSkeletons"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { CookieConsent } from "./components/CookieConsent"
import { ChunkErrorBoundary } from "./components/ChunkErrorBoundary"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

// Store routes
const StoreHome = lazy(() => import("./store/pages/StoreHome").then((m) => ({ default: m.StoreHome })))
const ProductPage = lazy(() => import("./store/pages/ProductPage").then((m) => ({ default: m.ProductPage })))
const CheckoutPage = lazy(() => import("./store/pages/CheckoutWhatsAppPage").then((m) => ({ default: m.CheckoutWhatsAppPage })))
const CheckoutOnlinePage = lazy(() => import("./store/pages/CheckoutPage").then((m) => ({ default: m.CheckoutPage })))
const OrderStatusPage = lazy(() => import("./store/pages/OrderStatusManualPage").then((m) => ({ default: m.OrderStatusManualPage })))
const MyOrdersPage = lazy(() => import("./store/pages/MyOrdersPage").then((m) => ({ default: m.MyOrdersPage })))
const SucatasPage = lazy(() => import("./store/pages/SucatasPage").then((m) => ({ default: m.SucatasPage })))
const SucataDetailPage = lazy(() => import("./store/pages/SucataDetailPage").then((m) => ({ default: m.SucataDetailPage })))

const PublicLanding = lazy(() => import("./pages/landing/PublicLanding").then((m) => ({ default: m.PublicLanding })))
const Contato = lazy(() => import("./pages/Contato").then((m) => ({ default: m.Contato })))
const Legal = lazy(() => import("./pages/Legal").then((m) => ({ default: m.Legal })))

const RoutesFallback = <PageSkeleton />

export default function App() {
    return (
        <QueryClientProvider client={queryClient}>
        <ThemeProvider defaultTheme="light" storageKey="store-theme">
            <Toaster position="top-right" richColors />
            <StoreAuthProvider>
                <CookieConsent />
                <BrowserRouter>
                    <PageViewTracker />
                    <ChunkErrorBoundary>
                        <Suspense fallback={RoutesFallback}>
                            <Routes>
                                {/* Legal */}
                                <Route path="/legal/:type" element={<Legal />} />
                                <Route path="/terms" element={<Navigate to="/legal/terms" />} />
                                <Route path="/privacy" element={<Navigate to="/legal/privacy" />} />
                                
                                {/* Store */}
                                <Route path="/" element={<StoreHome />} />
                                <Route path="/categoria/:slug" element={<StoreHome />} />
                                <Route path="/sucatas" element={<SucatasPage />} />
                                <Route path="/sucatas/:slug" element={<SucataDetailPage />} />
                                <Route path="/p/:slug" element={<ProductPage />} />
                                <Route path="/checkout" element={<CheckoutPage />} />
                                <Route path="/checkout/pagamento" element={<CheckoutOnlinePage />} />
                                <Route path="/pedido/:id" element={<OrderStatusPage />} />
                                <Route path="/meus-pedidos" element={<MyOrdersPage />} />
                                
                                <Route path="/contato" element={<Contato />} />
                                <Route path="/institucional" element={<PublicLanding />} />
                                
                                {/* Not Found -> Home */}
                                <Route path="*" element={<Navigate to="/" replace />} />
                            </Routes>
                        </Suspense>
                    </ChunkErrorBoundary>
                </BrowserRouter>
            </StoreAuthProvider>
        </ThemeProvider>
        </QueryClientProvider>
    )
}
