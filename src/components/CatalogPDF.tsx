import React from 'react';
import { 
  Document, 
  Page, 
  Text, 
  View, 
  StyleSheet, 
  Image, 
  Font 
} from '@react-pdf/renderer';
import { normalizeFotoDisplayUrl } from '@/lib/imagemUrls';

// Configuração de Estilos
const styles = StyleSheet.create({
  page: {
    padding: 30,
    backgroundColor: '#FFFFFF',
    fontFamily: 'Helvetica',
  },
  header: {
    marginBottom: 20,
    borderBottomWidth: 2,
    borderBottomColor: '#1A202C',
    paddingBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brandName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1A202C',
  },
  catalogTitle: {
    fontSize: 14,
    color: '#4A5568',
    marginTop: 4,
  },
  date: {
    fontSize: 10,
    color: '#A0AEC0',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 15,
  },
  card: {
    width: '47%', // 2 colunas com gap
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  image: {
    width: '100%',
    height: 120,
    objectFit: 'contain',
    borderRadius: 4,
    marginBottom: 8,
  },
  productName: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#2D3748',
    height: 28,
    marginBottom: 4,
  },
  priceTag: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#059669',
  },
  sku: {
    fontSize: 8,
    color: '#718096',
    marginTop: 2,
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 30,
    right: 30,
    textAlign: 'center',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 10,
  },
  footerText: {
    fontSize: 9,
    color: '#718096',
  }
});

interface Product {
  id: string;
  nome: string;
  preco: number;
  imagem_url: string | null;
  imagem_urls?: string[] | null;
  fotos?: string[] | null;
  condicao: string;
  sku: string;
}

interface Vehicle {
  marca: string;
  modelo: string;
  ano_modelo: number;
  codigo: string;
}

interface CatalogPDFProps {
  vehicle: Vehicle;
  products: Product[];
}

export const CatalogPDF: React.FC<CatalogPDFProps> = ({ vehicle, products }) => (
  <Document>
    <Page size="A4" style={styles.page}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.brandName}>Dourados Auto Peças</Text>
          <Text style={styles.catalogTitle}>
            Peças Disponíveis - Lote: {vehicle.marca} {vehicle.modelo} ({vehicle.codigo})
          </Text>
        </View>
        <Text style={styles.date}>Gerado em: {new Date().toLocaleDateString('pt-BR')}</Text>
      </View>

      {/* Grid de Peças */}
      <View style={styles.grid}>
        {products.map((product) => {
          // Resolve melhor imagem disponível: imagem_url, depois primeiro de imagem_urls, depois fotos
          const rawUrl = product.imagem_url
            || (Array.isArray(product.imagem_urls) && product.imagem_urls.length > 0 ? product.imagem_urls[0] : null)
            || (Array.isArray(product.fotos) && product.fotos.length > 0 ? product.fotos[0] : null);
          const imageUrl = rawUrl ? normalizeFotoDisplayUrl(rawUrl) : null;
          const productName = product.nome || 'Sem nome';
          const productPrice = product.preco || 0;
          const productSku = product.sku || 'N/A';
          
          return (
            <View key={product.id} style={styles.card} wrap={false}>
              {imageUrl ? (
                <Image 
                  style={styles.image} 
                  src={imageUrl}
                />
              ) : (
                <View style={[styles.image, { backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' }]}>
                  <Text style={{ fontSize: 10, color: '#9CA3AF' }}>Sem imagem</Text>
                </View>
              )}
              <Text style={styles.productName}>{productName}</Text>
              <Text style={styles.priceTag}>
                R$ {Number(productPrice).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </Text>
              <Text style={styles.sku}>SKU: {productSku}</Text>
            </View>
          );
        })}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Valores sujeitos a alteração. Consulte disponibilidade no WhatsApp. 
          Catálogo gerado automaticamente pelo CRM Dourados.
        </Text>
      </View>
    </Page>
  </Document>
);
