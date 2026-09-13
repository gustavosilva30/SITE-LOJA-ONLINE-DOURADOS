import { MapPin, Phone, MessageSquare, Clock, Mail } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { STORE_LOCATION, getStoreGoogleMapsUrl, getStoreMapEmbedUrl } from '@/lib/storeLocation'

export function Contato() {
  const whatsappHref = () => {
    const raw = import.meta.env.VITE_WHATSAPP_CONTACT || '556734243068'
    const d = String(raw).replace(/\D/g, '')
    const text = encodeURIComponent('Olá! Gostaria de mais informações.')
    return `https://wa.me/${d}?text=${text}`
  }

  return (
    <div className="min-h-screen bg-background py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4 italic uppercase tracking-tighter">
            Entre em <span className="text-primary">Contato</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto uppercase tracking-widest text-xs font-bold">
            Estamos à disposição para tirar suas dúvidas e ajudar no que for preciso.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Informações de Contato */}
          <div className="space-y-8">
            <Card className="border-none shadow-lg bg-card">
              <CardContent className="p-8 space-y-8">
                <div className="flex items-start gap-4">
                  <div className="bg-primary/10 p-3 rounded-2xl">
                    <MapPin className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg mb-1 uppercase italic">Endereço</h3>
                    <p className="text-muted-foreground">{STORE_LOCATION.fullAddress}</p>
                    <a 
                      href={getStoreGoogleMapsUrl()} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-primary hover:underline text-sm font-bold mt-2 inline-block"
                    >
                      Ver no Google Maps
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="bg-primary/10 p-3 rounded-2xl">
                    <Phone className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg mb-1 uppercase italic">Telefone</h3>
                    <p className="text-muted-foreground">{STORE_LOCATION.phoneDisplay}</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="bg-primary/10 p-3 rounded-2xl">
                    <Mail className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg mb-1 uppercase italic">E-mail</h3>
                    <p className="text-muted-foreground">pecasdourados@hotmail.com</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="bg-primary/10 p-3 rounded-2xl">
                    <Clock className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg mb-1 uppercase italic">Horário de Atendimento</h3>
                    <p className="text-muted-foreground">Segunda a Sexta: 07:30 às 11:30 | 13:00 às 18:00</p>
                    <p className="text-muted-foreground">Sábado: 07:30 às 11:30</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="pt-4">
              <Button 
                size="lg" 
                className="w-full h-16 text-lg font-black uppercase italic tracking-tighter gap-3 rounded-2xl shadow-xl hover:scale-[1.02] transition-all"
                onClick={() => window.open(whatsappHref(), '_blank')}
              >
                <MessageSquare className="w-6 h-6" />
                Falar com Atendente no WhatsApp
              </Button>
            </div>
          </div>

          {/* Mapa */}
          <div className="h-full min-h-[400px] rounded-[2.5rem] overflow-hidden border-8 border-white shadow-2xl relative">
            <iframe
              title="Localização da Loja"
              src={getStoreMapEmbedUrl()}
              width="100%"
              height="100%"
              style={{ border: 0 }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="absolute inset-0"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
