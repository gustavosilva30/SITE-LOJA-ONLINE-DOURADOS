import { memo, useState, useEffect } from "react"
import { Users } from "@phosphor-icons/react"
import { cn } from "@/lib/utils"
import { api } from "@/lib/api"

// Conjunto para evitar múltiplos refreshs da mesma foto na mesma sessão
const refreshedContactsSet = new Set<string>();

const getInitials = (name: string) => {
  if (!name) return "??"
  const cleanName = name.replace('+', '').trim()
  const parts = cleanName.split(" ").filter(p => p.length > 0)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return cleanName.substring(0, 2).toUpperCase()
}

export const ChatAvatar = memo(({ src, name, telefone, isGroup, className }: { src?: string | null, name: string, telefone: string, isGroup?: boolean, className?: string }) => {
  const [error, setError] = useState(false);
  const [currentSrc, setCurrentSrc] = useState(src);

  useEffect(() => {
    setCurrentSrc(src);
    setError(false);
  }, [src]);

  const initials = getInitials(name);

  if (isGroup) {
    return (
      <div className={cn("rounded-full flex items-center justify-center shrink-0 overflow-hidden bg-emerald-100 text-emerald-700", className)}>
        <Users size={24} weight="fill" />
      </div>
    );
  }

  if (!currentSrc || error) {
    return (
      <div className={cn("rounded-full flex items-center justify-center shrink-0 overflow-hidden bg-primary/10 text-primary font-black", className)}>
        {initials}
      </div>
    );
  }

  return (
    <img
      src={currentSrc}
      alt={name}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      className={cn("rounded-full object-cover shrink-0", className)}
      onError={() => {
        setError(true);
        // Tenta atualizar a foto no backend se ainda não tentamos nesta sessão
        if (telefone && !refreshedContactsSet.has(telefone)) {
          refreshedContactsSet.add(telefone);
          api.post(`/api/whatsapp/contatos/${telefone}/refresh-foto`, {}).then(resp => {
            // Em alguns lugares o interceptor do axios retorna resp.data, em outros o objeto direto.
            // Aqui assumimos que api é o axios customizado do projeto.
            const data = resp.data || resp;
            if (data?.status === 'success' && data?.foto_url) {
              setCurrentSrc(data.foto_url);
              setError(false);
            }
          }).catch(() => {});
        }
      }}
    />
  );
});
