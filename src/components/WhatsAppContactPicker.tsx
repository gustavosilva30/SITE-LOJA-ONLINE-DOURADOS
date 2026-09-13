import React, { useState, useEffect } from "react"
import { Modal } from "./ui/modal"
import { Input } from "./ui/input"
import { Button } from "./ui/button"
import { api } from "@/lib/api"
import { MagnifyingGlass, User, Phone, CheckCircle } from "@phosphor-icons/react"
import { Loader2 } from "lucide-react"

interface Contact {
    id: string
    nome_cliente: string
    telefone: string
    foto_url?: string
}

interface WhatsAppContactPickerProps {
    isOpen: boolean
    onClose: () => void
    onSelect: (contact: Contact) => void
}

export const WhatsAppContactPicker: React.FC<WhatsAppContactPickerProps> = ({
    isOpen,
    onClose,
    onSelect
}) => {
    const [search, setSearch] = useState("")
    const [contacts, setContacts] = useState<Contact[]>([])
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (isOpen) {
            fetchInitialContacts()
        }
    }, [isOpen])

    const fetchInitialContacts = async () => {
        setLoading(true)
        try {
            const resp = await api.get("/api/whatsapp/conversas")
            setContacts(resp.slice(0, 10)) // Mostra os 10 mais recentes
        } catch (err) {
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    const handleSearch = async () => {
        if (search.length < 2) return fetchInitialContacts()
        setLoading(true)
        try {
            // Usa o endpoint de conversas que aceita busca se disponível, ou filtra localmente
            const resp = await api.get("/api/whatsapp/conversas")
            const filtered = resp.filter((c: Contact) => 
                c.nome_cliente.toLowerCase().includes(search.toLowerCase()) || 
                c.telefone.includes(search)
            )
            setContacts(filtered)
        } catch (err) {
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Selecionar Contato WhatsApp"
            className="max-w-md"
        >
            <div className="space-y-4">
                <div className="relative">
                    <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                    <Input
                        placeholder="Buscar por nome ou telefone..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                        className="pl-10"
                    />
                </div>

                <div className="max-h-[300px] overflow-y-auto space-y-2 pr-2">
                    {loading ? (
                        <div className="flex flex-col items-center py-8 gap-2 text-muted-foreground">
                            <Loader2 className="h-6 w-6 animate-spin" />
                            <span className="text-sm">Buscando contatos...</span>
                        </div>
                    ) : contacts.length > 0 ? (
                        contacts.map((contact) => (
                            <button
                                key={contact.telefone}
                                onClick={() => onSelect(contact)}
                                className="w-full flex items-center gap-3 p-3 rounded-xl border border-border hover:border-emerald-500 hover:bg-emerald-50 transition-all group"
                            >
                                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0 overflow-hidden border border-slate-200">
                                    {contact.foto_url ? (
                                        <img src={contact.foto_url} alt={contact.nome_cliente} className="w-full h-full object-cover" />
                                    ) : (
                                        <User size={20} className="text-slate-400" />
                                    )}
                                </div>
                                <div className="flex-1 text-left">
                                    <p className="font-bold text-slate-800 group-hover:text-emerald-700 transition-colors line-clamp-1">
                                        {contact.nome_cliente}
                                    </p>
                                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                                        <Phone size={12} /> {contact.telefone}
                                    </p>
                                </div>
                                <CheckCircle className="text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity" size={20} weight="fill" />
                            </button>
                        ))
                    ) : (
                        <div className="text-center py-8 text-muted-foreground text-sm">
                            Nenhum contato encontrado.
                        </div>
                    )}
                </div>

                <div className="flex justify-end pt-2">
                    <Button variant="ghost" onClick={onClose}>Cancelar</Button>
                </div>
            </div>
        </Modal>
    )
}
