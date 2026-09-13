import { useState, useEffect } from "react"
import { useNavigate, Link } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { useAuthStore } from "@/store/authStore"
import { warmupAfterLogin } from "@/lib/loginPrefetch"
import { prefetchRoute } from "@/lib/prefetchRoute"
import { getApiBaseUrl } from "@/lib/apiBase"
import { setAuthToken, setRefreshToken } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Lock, User, Loader2, ShieldCheck, FileText, Trash2, Eye, EyeOff } from "lucide-react"

export function Login() {
    const [username, setUsername] = useState("")
    const [password, setPassword] = useState("")
    const [showPassword, setShowPassword] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const { setAuth } = useAuthStore()

    // Pre-warm dos chunks JS das telas mais usadas — enquanto o usuário digita
    // credenciais, o browser já está baixando o código de Dashboard/Produtos/WhatsApp.
    // Não tem efeito colateral (chunks são públicos, sem token).
    useEffect(() => {
        prefetchRoute("/")
        prefetchRoute("/produtos")
        prefetchRoute("/atendimento")
    }, [])

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)

        try {
            // Backend aceita username (preferido). Email continua aceito como fallback temporário.
            // Se o que o usuário digitou contém '@', mando como `email` também — assim
            // contas legadas que ainda não têm username populado podem entrar.
            const looksLikeEmail = /\S+@\S+\.\S+/.test(username)
            const body: Record<string, string> = { password }
            body.username = username.trim()
            if (looksLikeEmail) body.email = username.trim()

            const response = await fetch(`${getApiBaseUrl()}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            })
            const data = await response.json()
            if (!response.ok) throw new Error(data.detail || data.error || 'Erro ao fazer login')

            // Armazena token, refresh e usuário
            setAuthToken(data.access_token)
            if (data.refresh_token) setRefreshToken(data.refresh_token)
            localStorage.setItem('user', JSON.stringify(data.user))

            // Sincroniza store em memória ANTES de navegar
            const atendenteAuth = {
                ...data.user,
                id: data.user?.atendente_id || data.user?.id,
            }
            setAuth(data.user, atendenteAuth)

            // Pre-warm: dispara em background as queries das telas mais prováveis
            // (Dashboard, Produtos, static resources). Quando o navigate("/") completar,
            // a 1ª tela já tem dados em cache → carregamento instantâneo.
            warmupAfterLogin(queryClient)

            navigate("/")
        } catch (err: any) {
            setError(err.message || "Erro ao fazer login")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/20 via-background to-background">
            <Card className="w-full max-w-md shadow-2xl border-primary/20 backdrop-blur-sm bg-card/50">
                <CardHeader className="space-y-1 text-center">
                    <div className="flex justify-center mb-4">
                        <div className="p-3 rounded-2xl bg-primary/10 text-primary">
                            <Lock className="w-8 h-8" />
                        </div>
                    </div>
                    <CardTitle className="text-2xl font-black uppercase tracking-tighter">Acesso ao CRM</CardTitle>
                    <CardDescription>Entre com suas credenciais para gerenciar sua empresa.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleLogin} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="username">Nome de acesso</Label>
                            <div className="relative">
                                <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                <Input
                                    id="username"
                                    type="text"
                                    placeholder="seu.usuario"
                                    autoComplete="username"
                                    autoCapitalize="none"
                                    autoCorrect="off"
                                    spellCheck={false}
                                    className="pl-10"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    required
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password">Senha</Label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                <Input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    autoComplete="current-password"
                                    className="pl-10 pr-10"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-3 text-muted-foreground hover:text-foreground focus:outline-none transition-colors"
                                >
                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                        </div>

                        {error && (
                            <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-xs font-medium border border-destructive/20 animate-in fade-in zoom-in">
                                {error}
                            </div>
                        )}

                        <Button type="submit" className="w-full font-bold" disabled={loading}>
                            {loading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Entrando...
                                </>
                            ) : (
                                "Acessar Sistema"
                            )}
                        </Button>

                        <div className="flex items-center justify-center gap-4 pt-2">
                            <Link
                                to="/terms"
                                className="text-[10px] uppercase font-bold text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
                            >
                                <FileText className="w-3 h-3" />
                                Termos de Uso
                            </Link>
                            <span className="text-muted-foreground/30">•</span>
                            <Link
                                to="/privacy"
                                className="text-[10px] uppercase font-bold text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
                            >
                                <ShieldCheck className="w-3 h-3" />
                                Privacidade
                            </Link>
                            <span className="text-muted-foreground/30">•</span>
                            <Link
                                to="/deletion"
                                className="text-[10px] uppercase font-bold text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
                            >
                                <Trash2 className="w-3 h-3" />
                                Excluir Dados
                            </Link>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}
