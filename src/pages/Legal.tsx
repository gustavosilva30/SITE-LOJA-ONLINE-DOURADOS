import { useNavigate, useParams } from "react-router-dom"
import { ShieldCheck, FileText, Trash2, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { TERMS_OF_USE, PRIVACY_POLICY, DATA_DELETION_TEXT } from "@/constants/legal"

export function Legal() {
    const { type } = useParams<{ type: string }>()
    const navigate = useNavigate()

    const getContent = () => {
        switch (type) {
            case "privacy":
                return {
                    title: "Política de Privacidade",
                    description: "Última atualização: 02 de março de 2026",
                    icon: <ShieldCheck className="w-8 h-8" />,
                    text: PRIVACY_POLICY
                }
            case "deletion":
                return {
                    title: "Instruções para Exclusão de Dados",
                    description: "Procedimentos e prazos para solicitação",
                    icon: <Trash2 className="w-8 h-8" />,
                    text: DATA_DELETION_TEXT
                }
            case "terms":
            default:
                return {
                    title: "Termos de Uso",
                    description: "Última atualização: 02 de março de 2026",
                    icon: <FileText className="w-8 h-8" />,
                    text: TERMS_OF_USE
                }
        }
    }

    const content = getContent()

    return (
        <div className="min-h-screen bg-background p-4 md:p-8 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background">
            <div className="max-w-4xl mx-auto space-y-6">
                <Button
                    variant="ghost"
                    onClick={() => {
                        if (window.history.state && window.history.state.idx > 0) {
                            navigate(-1)
                        } else if (document.referrer && document.referrer.includes(window.location.host)) {
                            // Se abriu em nova guia mas do mesmo domínio
                            window.location.href = document.referrer
                        } else {
                            // Fallback
                            navigate("/login")
                        }
                    }}
                    className="hover:bg-primary/10"
                >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Voltar
                </Button>

                <Card className="shadow-2xl border-primary/20 backdrop-blur-sm bg-card/50">
                    <CardHeader className="space-y-1 text-center border-b border-primary/10 pb-8">
                        <div className="flex justify-center mb-4">
                            <div className="p-3 rounded-2xl bg-primary/10 text-primary">
                                {content.icon}
                            </div>
                        </div>
                        <CardTitle className="text-3xl font-black uppercase tracking-tighter">{content.title}</CardTitle>
                        <CardDescription>{content.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-8">
                        <div className="prose prose-sm dark:prose-invert max-w-none">
                            <div className="whitespace-pre-wrap text-sm text-muted-foreground leading-relaxed">
                                {content.text}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <div className="text-center text-xs text-muted-foreground pb-8">
                    &copy; {new Date().getFullYear()} DOURADOS AUTO PEÇAS. Todos os direitos reservados.
                </div>
            </div>
        </div>
    )
}
