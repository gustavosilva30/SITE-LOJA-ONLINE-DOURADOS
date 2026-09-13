import { STORE_LOCATION } from '@/lib/storeLocation';

/**
 * Dados estruturados (JSON-LD) da loja, em todas as páginas públicas.
 *
 * Por que isto e não só o microdata que já existe no rodapé: o microdata não
 * declara horário de funcionamento nem coordenadas, e é justamente isso que o
 * Google usa para responder busca com intenção de "aberto agora" e para montar
 * o resultado local. O Search Console mostra a consulta "auto peça aberto
 * agora" trazendo impressão sem clique — é a informação que falta.
 *
 * O endereço segue o Perfil da Empresa no Google (Vila São Francisco), que é a
 * referência: é contra ele que o Google cruza o endereço do site para decidir
 * confiança no resultado local. Os documentos legais em constants/legal.ts
 * ainda dizem "Vila Ubiratã" — lá é o endereço de registro do CNPJ e não foi
 * alterado por conta própria.
 */
export function StoreJsonLd() {
  const dados = {
    '@context': 'https://schema.org',
    '@type': 'AutoPartsStore',
    '@id': 'https://www.autopecasdourados.com.br/#loja',
    name: 'Dourados Auto Peças',
    description:
      'Loja de peças automotivas usadas originais em Dourados - MS, com desmanche próprio, ' +
      'compra online e retirada expressa na loja física.',
    url: 'https://www.autopecasdourados.com.br',
    image: 'https://www.autopecasdourados.com.br/assets/logo-dourados.png',
    logo: 'https://www.autopecasdourados.com.br/assets/logo-dourados.png',
    // Na ordem do Perfil da Empresa: o (67) 99910-0220 é o que o Google exibe.
    telephone: ['+5567999100220', '+556734243068'],
    priceRange: '$$',
    currenciesAccepted: 'BRL',
    paymentAccepted: 'Dinheiro, PIX, Cartão de Crédito, Cartão de Débito',
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Av. Marcelino Pires, 5235 - Vila São Francisco',
      addressLocality: 'Dourados',
      addressRegion: 'MS',
      postalCode: '79833-000',
      addressCountry: 'BR',
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: STORE_LOCATION.lat,
      longitude: STORE_LOCATION.lng,
    },
    // Seg a Sex 07:30–11:00 e 13:00–17:30; Sáb 08:00–12:00. Dois blocos nos dias
    // úteis porque a loja fecha para almoço — declarar 07:30–17:30 direto faria
    // o Google dizer "aberto" no horário em que está fechada.
    openingHoursSpecification: [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        opens: '07:30',
        closes: '11:00',
      },
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        opens: '13:00',
        closes: '17:30',
      },
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: 'Saturday',
        opens: '08:00',
        closes: '12:00',
      },
    ],
    areaServed: [
      { '@type': 'City', name: 'Dourados' },
      { '@type': 'State', name: 'Mato Grosso do Sul' },
    ],
    knowsAbout: [
      'peças automotivas usadas',
      'desmanche de veículos',
      'auto peças em Dourados',
      'sucata de carro',
    ],
  };

  const site = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    url: 'https://www.autopecasdourados.com.br',
    name: 'Dourados Auto Peças',
    // Habilita a caixa de busca do site no resultado do Google.
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: 'https://www.autopecasdourados.com.br/?search={search_term_string}',
      },
      'query-input': 'required name=search_term_string',
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify([dados, site]) }}
    />
  );
}
