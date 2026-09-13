import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { STORE_NAVY, STORE_ON_DARK, STORE_PUBLIC_SCOPE_CLASS } from '../storeTheme';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { useStoreAuth } from '../contexts/StoreAuthContext';
import { User, Lock, Phone, Mail, Loader2, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { getApiBaseUrl } from '@/lib/apiBase';

interface StoreLoginModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: () => void;
}

type ModeType = 'login' | 'register' | 'google-phone' | 'forgot-phone' | 'forgot-code';

export function StoreLoginModal({ isOpen, onClose, onSuccess }: StoreLoginModalProps) {
    const { login: setStoreLogin } = useStoreAuth();
    const [mode, setMode] = useState<ModeType>('login');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // Cliente recém-criado via Google, ainda sem WhatsApp (obrigatório na loja).
    const [pendingGoogleCustomer, setPendingGoogleCustomer] = useState<any>(null);
    const [pendingGoogleToken, setPendingGoogleToken] = useState<string | null>(null);
    const [googlePhone, setGooglePhone] = useState('');
    const [googleName, setGoogleName] = useState('');
    const [googlePassword, setGooglePassword] = useState('');

    // Recuperação de senha (código enviado por WhatsApp via Evolution API)
    const [forgotPhone, setForgotPhone] = useState('');
    const [forgotCode, setForgotCode] = useState('');
    const [forgotNewPassword, setForgotNewPassword] = useState('');
    const [forgotMessage, setForgotMessage] = useState<string | null>(null);

    // Reseta o passo "completar cadastro" se o cliente fechar o modal sem terminar
    // (senão reabrir mostraria o formulário preso de uma sessão anterior).
    useEffect(() => {
        if (!isOpen) {
            setMode('login');
            setPendingGoogleCustomer(null);
            setPendingGoogleToken(null);
            setGooglePhone('');
            setGoogleName('');
            setGooglePassword('');
            setForgotPhone('');
            setForgotCode('');
            setForgotNewPassword('');
            setForgotMessage(null);
            setError(null);
        }
    }, [isOpen]);

    const turnstileContainerRef = useRef<HTMLDivElement>(null);
    const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
    const [turnstileWidgetId, setTurnstileWidgetId] = useState<string | null>(null);

    // Tokens do Turnstile são de uso único — o backend consome o token em toda
    // tentativa de login/cadastro (mesmo quando a senha está errada). Sem isso,
    // uma segunda tentativa reenvia o mesmo token já consumido e a Cloudflare
    // sempre recusa, mostrando "CAPTCHA inválida" mesmo com o widget marcado
    // como sucesso na tela.
    const resetTurnstile = () => {
        setTurnstileToken(null);
        if (turnstileWidgetId && (window as any).turnstile) {
            try {
                (window as any).turnstile.reset(turnstileWidgetId);
            } catch (e) {
                console.error('Erro ao resetar Turnstile:', e);
            }
        }
    };

    // Efeito para carregar e renderizar o Cloudflare Turnstile
    useEffect(() => {
        if (!isOpen) return;

        const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
        if (!siteKey) return;

        const renderTurnstile = () => {
            if (turnstileContainerRef.current && (window as any).turnstile) {
                try {
                    if (turnstileWidgetId) {
                        (window as any).turnstile.remove(turnstileWidgetId);
                    }
                    const id = (window as any).turnstile.render(turnstileContainerRef.current, {
                        sitekey: siteKey,
                        action: 'turnstile-spin-v2',
                        callback: (token: string) => {
                            setTurnstileToken(token);
                        },
                        'error-callback': () => {
                            setTurnstileToken(null);
                        },
                        'expired-callback': () => {
                            setTurnstileToken(null);
                        }
                    });
                    setTurnstileWidgetId(id);
                } catch (e) {
                    console.error('Erro ao inicializar Turnstile:', e);
                }
            }
        };

        const scriptId = 'cloudflare-turnstile-script';
        if (!document.getElementById(scriptId)) {
            const script = document.createElement('script');
            script.id = scriptId;
            script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
            script.async = true;
            script.defer = true;
            script.onload = renderTurnstile;
            document.body.appendChild(script);
        } else if ((window as any).turnstile) {
            renderTurnstile();
        }
    }, [mode, isOpen]);

    // Efeito para carregar e inicializar o Google Sign-In.
    // Depende só de `isOpen` (não de `mode`): o botão fica fora do bloco condicional
    // de login/cadastro, então reinicializar a cada troca de aba disparava vários
    // `prompt()` concorrentes — o Chrome rejeita com "Only one navigator.credentials.get
    // request may be outstanding at one time" e passa a bloquear o FedCM no site.
    useEffect(() => {
        if (!isOpen) return;

        const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
        if (!googleClientId) return;

        let cancelled = false;

        const initializeGoogle = () => {
            if (cancelled || !(window as any).google?.accounts?.id) return;

            (window as any).google.accounts.id.initialize({
                client_id: googleClientId,
                callback: handleGoogleCredentialResponse,
                use_fedcm_for_prompt: false
            });

            // Não chama .prompt() (One Tap automático): é a origem mais provável do
            // Chrome marcar o site como "FedCM disabled" após dispensas repetidas.
            // O clique explícito no botão abaixo é suficiente e mais robusto.

            // Renderiza o botão personalizado
            const googleButtonDiv = document.getElementById('google-signin-button');
            if (googleButtonDiv) {
                (window as any).google.accounts.id.renderButton(
                    googleButtonDiv,
                    { theme: 'outline', size: 'large', width: '100%' }
                );
            }
        };

        const scriptId = 'google-gsi-client';
        if (!document.getElementById(scriptId)) {
            const script = document.createElement('script');
            script.id = scriptId;
            script.src = 'https://accounts.google.com/gsi/client';
            script.async = true;
            script.defer = true;
            script.onload = initializeGoogle;
            document.body.appendChild(script);
        } else {
            initializeGoogle();
        }

        return () => {
            cancelled = true;
            try {
                (window as any).google?.accounts?.id?.cancel();
            } catch {
                // no-op
            }
        };
    }, [isOpen]);

    const handleGoogleCredentialResponse = async (response: any) => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`${getApiBaseUrl()}/api/store/auth/google`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idToken: response.credential })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || data.detail || 'Erro ao entrar com o Google');

            // O Google não fornece WhatsApp, mas é o identificador principal do cliente
            // na loja — pede antes de liberar o acesso.
            if (data.phone_required) {
                setPendingGoogleCustomer(data.customer);
                setPendingGoogleToken(data.access_token || null);
                setGoogleName(data.customer?.name || '');
                setMode('google-phone');
                return;
            }

            setStoreLogin(data.customer, data.access_token);
            toast.success('Bem-vindo(a) via Google!');
            onSuccess?.();
            onClose();
        } catch (err: any) {
            setError(err.message);
            toast.error(err.message);
        } finally {
            setLoading(false);
        }
    };

    const GOOGLE_PASSWORD_RULE = /^(?=.*[A-Z])(?=.*\d).{8,}$/;

    const handleCompleteGooglePhone = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!pendingGoogleCustomer) return;

        if (!GOOGLE_PASSWORD_RULE.test(googlePassword)) {
            setError('A senha deve ter no mínimo 8 caracteres, com pelo menos 1 letra maiúscula e 1 número.');
            return;
        }

        setLoading(true);
        setError(null);

        if (!pendingGoogleToken) {
            setError('Sessão expirada. Faça login com o Google novamente.');
            return;
        }

        try {
            const res = await fetch(`${getApiBaseUrl()}/api/store/auth/complete-phone`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${pendingGoogleToken}`,
                },
                body: JSON.stringify({
                    phone: googlePhone,
                    name: googleName,
                    password: googlePassword,
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || data.detail || 'Não foi possível salvar o WhatsApp');

            setStoreLogin(data.customer, pendingGoogleToken);
            setPendingGoogleCustomer(null);
            setPendingGoogleToken(null);
            toast.success('Cadastro concluído com sucesso!');
            onSuccess?.();
            onClose();
        } catch (err: any) {
            setError(err.message);
            toast.error(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Form states
    const [formData, setFormData] = useState({
        login: '',
        password: '',
        name: '',
        phone: '',
        email: '',
    });

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const res = await fetch(`${getApiBaseUrl()}/api/store/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    login: formData.login,
                    password: formData.password,
                    turnstileToken
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || data.detail || 'Credenciais inválidas');

            setStoreLogin(data.customer, data.access_token);
            toast.success('Bem-vindo de volta!');
            onSuccess?.();
            onClose();
        } catch (err: any) {
            setError(err.message);
            toast.error(err.message);
            resetTurnstile();
        } finally {
            setLoading(false);
        }
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const res = await fetch(`${getApiBaseUrl()}/api/store/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: formData.name,
                    phone: formData.phone,
                    email: formData.email || undefined,
                    password: formData.password,
                    turnstileToken
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || data.detail || 'Erro ao realizar cadastro');

            setStoreLogin(data.customer, data.access_token);
            toast.success('Cadastro realizado com sucesso!');
            onSuccess?.();
            onClose();
        } catch (err: any) {
            setError(err.message);
            toast.error(err.message);
            resetTurnstile();
        } finally {
            setLoading(false);
        }
    };

    const handleForgotPasswordRequest = async (channel: 'whatsapp' | 'email') => {
        if (!forgotPhone.trim()) {
            setError('Informe o WhatsApp cadastrado na sua conta.');
            return;
        }
        setLoading(true);
        setError(null);

        try {
            const res = await fetch(`${getApiBaseUrl()}/api/store/auth/forgot-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: forgotPhone, channel })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || data.detail || 'Não foi possível enviar o código');

            setForgotMessage(data.message || 'Se esta conta existir, você vai receber um código em instantes.');
            setMode('forgot-code');
        } catch (err: any) {
            setError(err.message);
            toast.error(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const res = await fetch(`${getApiBaseUrl()}/api/store/auth/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phone: forgotPhone,
                    code: forgotCode,
                    new_password: forgotNewPassword,
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || data.detail || 'Código inválido ou expirado');

            toast.success('Senha alterada com sucesso!');
            if (data.customer && data.access_token) {
                setStoreLogin(data.customer, data.access_token);
            }
            onSuccess?.();
            onClose();
        } catch (err: any) {
            setError(err.message);
            toast.error(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={
                mode === 'login' ? "Acesse sua conta"
                    : mode === 'google-phone' ? "Só mais um passo"
                    : mode === 'forgot-phone' ? "Esqueci minha senha"
                    : mode === 'forgot-code' ? "Digite o código recebido"
                    : "Crie sua conta"
            }
            className={STORE_PUBLIC_SCOPE_CLASS}
        >
            <div className="space-y-4 pt-2">
                {mode === 'login' && (
                    <form onSubmit={handleLogin} className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">WhatsApp ou E-mail</label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input
                                    name="login"
                                    placeholder="Ex: 67999999999 ou seu e-mail"
                                    value={formData.login}
                                    onChange={handleInputChange}
                                    className="pl-10"
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium">Sua Senha</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input
                                    type="password"
                                    name="password"
                                    placeholder="Digite sua senha"
                                    value={formData.password}
                                    onChange={handleInputChange}
                                    className="pl-10"
                                    required
                                />
                            </div>
                            <div className="text-right">
                                <button
                                    type="button"
                                    className="text-xs text-muted-foreground underline hover:text-primary"
                                    onClick={() => { setForgotPhone(formData.login.replace(/\D/g, '') ? formData.login : ''); setError(null); setMode('forgot-phone'); }}
                                >
                                    Esqueci minha senha
                                </button>
                            </div>
                        </div>

                        {import.meta.env.VITE_TURNSTILE_SITE_KEY && (
                            <div className="flex justify-center my-3 min-h-[65px]">
                                <div ref={turnstileContainerRef} data-action="turnstile-spin-v2" />
                            </div>
                        )}
                        <Button
                            type="submit"
                            disabled={loading}
                            className={`w-full h-11 font-bold border-0 ${STORE_ON_DARK}`}
                            style={{ backgroundColor: STORE_NAVY }}
                        >
                            {loading ? <Loader2 className="animate-spin" /> : 'Entrar'}
                        </Button>
                    </form>
                )}

                {mode === 'forgot-phone' && (
                    <div className="space-y-4">
                        <p className="text-sm text-muted-foreground text-center">
                            Informe o WhatsApp da sua conta e escolha para onde enviar o código de recuperação.
                        </p>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">WhatsApp *</label>
                            <div className="relative">
                                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input
                                    name="forgotPhone"
                                    placeholder="(67) 99999-9999"
                                    value={forgotPhone}
                                    onChange={(e) => setForgotPhone(e.target.value)}
                                    className="pl-10"
                                    required
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Button
                                type="button"
                                disabled={loading}
                                onClick={() => handleForgotPasswordRequest('whatsapp')}
                                className={`w-full h-11 gap-2 font-bold border-0 ${STORE_ON_DARK}`}
                                style={{ backgroundColor: STORE_NAVY }}
                            >
                                {loading ? <Loader2 className="animate-spin" /> : <>Enviar código por WhatsApp</>}
                            </Button>
                            <Button
                                type="button"
                                disabled={loading}
                                onClick={() => handleForgotPasswordRequest('email')}
                                className={`w-full h-11 gap-2 font-bold border-0 ${STORE_ON_DARK}`}
                                style={{ backgroundColor: STORE_NAVY }}
                            >
                                {loading ? <Loader2 className="animate-spin" /> : <><Mail className="w-4 h-4" /> Enviar código por e-mail</>}
                            </Button>
                        </div>
                        <p className="text-[10px] text-muted-foreground text-center">
                            Por e-mail só funciona se você cadastrou um e-mail na sua conta.
                        </p>
                        <button
                            type="button"
                            className="w-full text-xs text-muted-foreground underline hover:text-primary text-center"
                            onClick={() => { setError(null); setMode('login'); }}
                        >
                            Voltar para o login
                        </button>
                    </div>
                )}

                {mode === 'forgot-code' && (
                    <form onSubmit={handleResetPassword} className="space-y-4">
                        {forgotMessage && (
                            <p className="text-sm text-muted-foreground text-center">{forgotMessage}</p>
                        )}
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Código recebido no WhatsApp *</label>
                            <Input
                                name="forgotCode"
                                placeholder="6 dígitos"
                                value={forgotCode}
                                onChange={(e) => setForgotCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                inputMode="numeric"
                                maxLength={6}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Nova senha *</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input
                                    type="password"
                                    name="forgotNewPassword"
                                    placeholder="Mín. 8 caracteres, 1 maiúscula e 1 número"
                                    value={forgotNewPassword}
                                    onChange={(e) => setForgotNewPassword(e.target.value)}
                                    className="pl-10"
                                    minLength={8}
                                    required
                                />
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Mínimo 8 caracteres, com pelo menos 1 letra maiúscula e 1 número.
                            </p>
                        </div>
                        <Button
                            type="submit"
                            disabled={loading}
                            className={`w-full h-11 gap-2 font-bold border-0 ${STORE_ON_DARK}`}
                            style={{ backgroundColor: STORE_NAVY }}
                        >
                            {loading ? <Loader2 className="animate-spin" /> : 'Redefinir senha'}
                        </Button>
                        <button
                            type="button"
                            className="w-full text-xs text-muted-foreground underline hover:text-primary text-center"
                            onClick={() => { setError(null); setMode('forgot-phone'); }}
                        >
                            Não recebi o código
                        </button>
                    </form>
                )}

                {mode === 'register' && (
                    <form onSubmit={handleRegister} className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Nome Completo *</label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input
                                    name="name"
                                    placeholder="Seu nome"
                                    value={formData.name}
                                    onChange={handleInputChange}
                                    className="pl-10"
                                    required
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">WhatsApp *</label>
                            <div className="relative">
                                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input
                                    name="phone"
                                    placeholder="(67) 99999-9999"
                                    value={formData.phone}
                                    onChange={handleInputChange}
                                    className="pl-10"
                                    required
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">E-mail (opcional)</label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input
                                    type="email"
                                    name="email"
                                    placeholder="seuemail@exemplo.com"
                                    value={formData.email}
                                    onChange={handleInputChange}
                                    className="pl-10"
                                />
                            </div>
                            <p className="text-[10px] text-muted-foreground">Usamos só para poder te enviar o código de recuperação de senha por e-mail, caso o WhatsApp não esteja disponível.</p>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium">Crie uma Senha *</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input
                                    type="password"
                                    name="password"
                                    placeholder="Mínimo 6 caracteres"
                                    value={formData.password}
                                    onChange={handleInputChange}
                                    className="pl-10"
                                    required
                                    minLength={6}
                                />
                            </div>
                        </div>

                        {import.meta.env.VITE_TURNSTILE_SITE_KEY && (
                            <div className="flex justify-center my-3 min-h-[65px]">
                                <div ref={turnstileContainerRef} data-action="turnstile-spin-v2" />
                            </div>
                        )}
                        <Button
                            type="submit"
                            disabled={loading}
                            className={`w-full h-11 gap-2 font-bold border-0 ${STORE_ON_DARK}`}
                            style={{ backgroundColor: STORE_NAVY }}
                        >
                            {loading ? <Loader2 className="animate-spin" /> : (
                                <>
                                    Finalizar Cadastro
                                    <ArrowRight className="w-4 h-4" />
                                </>
                            )}
                        </Button>
                    </form>
                )}

                {mode === 'google-phone' && (
                    <form onSubmit={handleCompleteGooglePhone} className="space-y-4">
                        <p className="text-sm text-muted-foreground text-center">
                            Sua conta Google foi verificada. Confira seus dados para concluir o cadastro
                            — o WhatsApp é como a loja confirma seus pedidos.
                        </p>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Nome Completo *</label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input
                                    name="googleName"
                                    placeholder="Seu nome"
                                    value={googleName}
                                    onChange={(e) => setGoogleName(e.target.value)}
                                    className="pl-10"
                                    required
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">WhatsApp *</label>
                            <div className="relative">
                                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input
                                    name="googlePhone"
                                    placeholder="(67) 99999-9999"
                                    value={googlePhone}
                                    onChange={(e) => setGooglePhone(e.target.value)}
                                    className="pl-10"
                                    required
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Crie uma Senha *</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input
                                    type="password"
                                    name="googlePassword"
                                    placeholder="Mín. 8 caracteres, 1 maiúscula e 1 número"
                                    value={googlePassword}
                                    onChange={(e) => setGooglePassword(e.target.value)}
                                    className="pl-10"
                                    minLength={8}
                                    required
                                />
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Mínimo 8 caracteres, com pelo menos 1 letra maiúscula e 1 número.
                            </p>
                        </div>
                        <Button
                            type="submit"
                            disabled={loading}
                            className={`w-full h-11 gap-2 font-bold border-0 ${STORE_ON_DARK}`}
                            style={{ backgroundColor: STORE_NAVY }}
                        >
                            {loading ? <Loader2 className="animate-spin" /> : (
                                <>
                                    Concluir Cadastro
                                    <ArrowRight className="w-4 h-4" />
                                </>
                            )}
                        </Button>
                    </form>
                )}

                {error && <p className="text-red-500 text-sm text-center font-medium bg-red-50 p-2 rounded">{error}</p>}

                {mode !== 'google-phone' && mode !== 'forgot-phone' && mode !== 'forgot-code' && (
                <div className="pt-4 border-t text-center space-y-4">
                    {import.meta.env.VITE_GOOGLE_CLIENT_ID && (
                        <div className="pb-2">
                            <div id="google-signin-button" className="w-full flex justify-center" />
                            <div className="flex items-center my-4">
                                <div className="flex-grow border-t border-muted" />
                                <span className="mx-4 text-xs text-muted-foreground uppercase">ou</span>
                                <div className="flex-grow border-t border-muted" />
                            </div>
                        </div>
                    )}

                    <p className="text-sm text-muted-foreground">
                        {mode === 'login' ? "Ainda não tem cadastro?" : "Já possui uma conta?"}
                    </p>
                    <Button
                        variant="outline"
                        type="button"
                        className="w-full border-emerald-500 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10"
                        onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}
                    >
                        {mode === 'login' ? "Crie sua conta agora" : "Fazer login"}
                    </Button>
                    <p className="text-[10px] text-muted-foreground text-center leading-relaxed px-1">
                        Ao continuar, você concorda com nossos{' '}
                        <Link to="/legal/terms" className="underline hover:text-primary font-medium">
                            termos de uso
                        </Link>
                        ,{' '}
                        <Link to="/legal/privacy" className="underline hover:text-primary font-medium">
                            política de privacidade
                        </Link>
                        {' '}e{' '}
                        <Link to="/legal/deletion" className="underline hover:text-primary font-medium">
                            termos de exclusão de dados
                        </Link>
                        .
                    </p>
                </div>
                )}
            </div>
        </Modal>
    );
}
