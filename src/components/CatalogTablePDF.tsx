import React from 'react';
import { 
  Document, 
  Page, 
  Text, 
  View, 
  StyleSheet, 
  Image 
} from '@react-pdf/renderer';
import { normalizeFotoDisplayUrl } from '@/lib/imagemUrls';

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
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1A202C',
  },
  catalogTitle: {
    fontSize: 12,
    color: '#4A5568',
    marginTop: 4,
  },
  date: {
    fontSize: 10,
    color: '#A0AEC0',
  },
  table: {
    width: 'auto',
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  tableRow: {
    margin: 'auto',
    flexDirection: 'row',
  },
  tableColHeader: {
    backgroundColor: '#F8FAFC',
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderLeftWidth: 0,
    borderTopWidth: 0,
  },
  tableCol: {
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderLeftWidth: 0,
    borderTopWidth: 0,
    justifyContent: 'center',
  },
  tableCellHeader: {
    margin: 5,
    fontSize: 10,
    fontWeight: 'bold',
    color: '#1A202C',
  },
  tableCell: {
    margin: 5,
    fontSize: 9,
    color: '#2D3748',
  },
  thumbnail: {
    width: 40,
    height: 40,
    margin: 2,
    objectFit: 'contain',
    borderRadius: 2,
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
    fontSize: 8,
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
  estoque_atual: number;
  localizacao?: string | null;
}

interface Vehicle {
  marca: string;
  modelo: string;
  ano_modelo: number;
  codigo: string;
}

interface CatalogTablePDFProps {
  vehicle: Vehicle;
  products: Product[];
}

export const CatalogTablePDF: React.FC<CatalogTablePDFProps> = ({ vehicle, products }) => (
  <Document>
    <Page size="A4" style={styles.page}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.brandName}>Dourados Auto Peças</Text>
          <Text style={styles.catalogTitle}>
            Planilha de Peças - Lote: {vehicle.marca} {vehicle.modelo} ({vehicle.codigo})
          </Text>
        </View>
        <Text style={styles.date}>Gerado em: {new Date().toLocaleDateString('pt-BR')}</Text>
      </View>

      {/* Tabela de Peças */}
      <View style={styles.table}>
        {/* Header da Tabela */}
        <View style={styles.tableRow}>
          <View style={[styles.tableColHeader, { width: '10%' }]}>
            <Text style={styles.tableCellHeader}>Foto</Text>
          </View>
          <View style={[styles.tableColHeader, { width: '35%' }]}>
            <Text style={styles.tableCellHeader}>Produto</Text>
          </View>
          <View style={[styles.tableColHeader, { width: '8%' }]}>
            <Text style={styles.tableCellHeader}>Qtd</Text>
          </View>
          <View style={[styles.tableColHeader, { width: '18%' }]}>
            <Text style={styles.tableCellHeader}>SKU</Text>
          </View>
          <View style={[styles.tableColHeader, { width: '17%' }]}>
            <Text style={styles.tableCellHeader}>Localização</Text>
          </View>
          <View style={[styles.tableColHeader, { width: '12%' }]}>
            <Text style={styles.tableCellHeader}>Preço</Text>
          </View>
        </View>

        {/* Linhas da Tabela */}
        {products.map((product) => {
          // Resolve melhor imagem disponível: imagem_url, depois primeiro de imagem_urls, depois fotos
          const rawUrl = product.imagem_url
            || (Array.isArray(product.imagem_urls) && product.imagem_urls.length > 0 ? product.imagem_urls[0] : null)
            || (Array.isArray(product.fotos) && product.fotos.length > 0 ? product.fotos[0] : null);
          const imageUrl = rawUrl ? normalizeFotoDisplayUrl(rawUrl) : null;
          const productName = product.nome || 'Sem nome';
          const productPrice = product.preco || 0;
          const productSku = product.sku || 'N/A';
          const productQuantity = product.estoque_atual || 1;
          const localizacao = product.localizacao || '';
          
          return (
            <View key={product.id} style={styles.tableRow} wrap={false}>
              <View style={[styles.tableCol, { width: '10%' }]}>
                {imageUrl ? (
                  <Image 
                    style={styles.thumbnail} 
                    src={imageUrl}
                  />
                ) : (
                  <View style={[styles.thumbnail, { backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' }]}>
                    <Text style={{ fontSize: 6, color: '#9CA3AF' }}>Sem</Text>
                  </View>
                )}
              </View>
              <View style={[styles.tableCol, { width: '35%' }]}>
                <Text style={styles.tableCell}>{productName}</Text>
              </View>
              <View style={[styles.tableCol, { width: '8%' }]}>
                <Text style={styles.tableCell}>{productQuantity}</Text>
              </View>
              <View style={[styles.tableCol, { width: '18%' }]}>
                <Text style={styles.tableCell}>{productSku}</Text>
              </View>
              <View style={[styles.tableCol, { width: '17%' }]}>
                <Text style={[
                  styles.tableCell,
                  localizacao ? { color: '#7C3AED', fontWeight: 'bold' } : { color: '#9CA3AF' }
                ]}>
                  {localizacao || '-'}
                </Text>
              </View>
              <View style={[styles.tableCol, { width: '12%' }]}>
                <Text style={styles.tableCell}>
                  R$ {Number(productPrice).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Documento para conferência interna e controle de estoque. 
          Gerado automaticamente pelo CRM Dourados em {new Date().toLocaleString('pt-BR')}.
        </Text>
      </View>
    </Page>
  </Document>
);
