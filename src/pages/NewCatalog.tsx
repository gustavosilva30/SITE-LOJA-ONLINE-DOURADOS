import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Search, Plus, Package, Car, Calendar, Settings } from 'lucide-react'
import { api, newCatalogApi } from '@/lib/api'

interface Model {
  id: string
  brand: string
  name: string
}

interface ModelYear {
  id: string
  modelId: string
  yearStart: number
  yearEnd: number | null
}

interface ModelVersion {
  id: string
  modelYearId: string
  version: string
  engine: string | null
  brand: string
  modelName: string
  yearStart: number
  yearEnd: number | null
}

interface Part {
  id: string
  sku: string
  description: string
}

interface CatalogTree {
  brand: string
  modelName: string
  modelId: string
  years: {
    [key: string]: {
      yearId: string
      yearStart: number
      yearEnd: number | null
      versions: Array<{
        versionId: string
        version: string
        engine: string | null
      }>
    }
  }
}

export default function NewCatalog() {
  const [activeTab, setActiveTab] = useState('parts')
  const [parts, setParts] = useState<Part[]>([])
  const [catalogTree, setCatalogTree] = useState<CatalogTree[]>([])
  const [selectedVersions, setSelectedVersions] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  
  // Form de nova peça
  const [newPart, setNewPart] = useState({
    sku: '',
    description: ''
  })
  const [isCreatingPart, setIsCreatingPart] = useState(false)

  // Carregar árvore do catálogo
  useEffect(() => {
    const fetchCatalogTree = async () => {
      try {
        const response = await newCatalogApi.getCatalogTree()
        setCatalogTree(response.data)
      } catch (error) {
        console.error('Erro ao carregar catálogo:', error)
      }
    }
    fetchCatalogTree()
  }, [])

  // Carregar peças
  useEffect(() => {
    const fetchParts = async () => {
      setLoading(true)
      try {
        const response = await newCatalogApi.listarParts(searchTerm)
        setParts(response.data || [])
      } catch (error) {
        console.error('Erro ao carregar peças:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchParts()
  }, [searchTerm])

  const handleCreatePart = async () => {
    if (!newPart.sku || !newPart.description) {
      alert('Preencha SKU e descrição')
      return
    }

    setIsCreatingPart(true)
    try {
      const response = await newCatalogApi.criarPart(newPart)
      const createdPart = response.data
      
      // Vincular às versões selecionadas
      if (selectedVersions.length > 0) {
        await newCatalogApi.criarPartApplications(createdPart.id, selectedVersions)
      }

      // Resetar formulário
      setNewPart({ sku: '', description: '' })
      setSelectedVersions([])
      
      // Recarregar peças
      const partsResponse = await newCatalogApi.listarParts()
      setParts(partsResponse.data || [])
      
      alert('Peça criada com sucesso!')
    } catch (error) {
      console.error('Erro ao criar peça:', error)
      alert('Erro ao criar peça')
    } finally {
      setIsCreatingPart(false)
    }
  }

  const toggleVersion = (versionId: string) => {
    setSelectedVersions(prev => 
      prev.includes(versionId) 
        ? prev.filter(id => id !== versionId)
        : [...prev, versionId]
    )
  }

  const toggleModel = (modelKey: string) => {
    // Implementar expandir/recolher modelo se necessário
  }

  const toggleYear = (modelKey: string, yearKey: string) => {
    // Implementar expandir/recolher ano se necessário
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Catálogo de Autopeças</h1>
          <p className="text-muted-foreground mt-1">
            Sistema de compatibilidade estruturada para peças automotivas
          </p>
        </div>
      </div>

      <div className="flex gap-4">
        <div className="flex-1">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="w-5 h-5" />
                Cadastro de Peça
              </CardTitle>
              <CardDescription>
                Preencha os dados da peça e selecione as versões compatíveis
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Dados básicos da peça */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="sku">SKU</Label>
                  <Input
                    id="sku"
                    placeholder="Ex: PAR-001"
                    value={newPart.sku}
                    onChange={(e) => setNewPart(prev => ({ ...prev, sku: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Descrição</Label>
                  <Input
                    id="description"
                    placeholder="Ex: Paralama dianteiro"
                    value={newPart.description}
                    onChange={(e) => setNewPart(prev => ({ ...prev, description: e.target.value }))}
                  />
                </div>
              </div>

              {/* Árvore de compatibilidade */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Car className="w-4 h-4" />
                  <Label className="text-base font-semibold">Compatibilidade</Label>
                  <Badge variant="outline">
                    {selectedVersions.length} versões selecionadas
                  </Badge>
                </div>

                <div className="border rounded-lg max-h-96 overflow-y-auto">
                  {catalogTree.map((model) => (
                    <div key={model.modelId} className="border-b last:border-b-0">
                      {/* Modelo */}
                      <div 
                        className="p-3 bg-muted/50 cursor-pointer hover:bg-muted/70"
                        onClick={() => toggleModel(`${model.brand}|${model.modelName}`)}
                      >
                        <div className="flex items-center gap-2">
                          <Car className="w-4 h-4" />
                          <span className="font-semibold">
                            {model.brand} {model.modelName}
                          </span>
                        </div>
                      </div>

                      {/* Anos e Versões */}
                      <div className="pl-6">
                        {Object.entries(model.years).map(([yearKey, year]) => (
                          <div key={year.yearId} className="border-b last:border-b-0">
                            {/* Ano */}
                            <div 
                              className="p-2 hover:bg-muted/30 cursor-pointer"
                              onClick={() => toggleYear(`${model.brand}|${model.modelName}`, yearKey)}
                            >
                              <div className="flex items-center gap-2">
                                <Calendar className="w-3 h-3" />
                                <span className="text-sm font-medium">
                                  {year.yearStart} - {year.yearEnd || 'Atual'}
                                </span>
                              </div>
                            </div>

                            {/* Versões */}
                            <div className="pl-6 space-y-1 p-2">
                              {year.versions.map((version) => (
                                <div 
                                  key={version.versionId}
                                  className="flex items-center gap-2 p-1 hover:bg-muted/20 rounded"
                                >
                                  <input
                                    type="checkbox"
                                    id={version.versionId}
                                    checked={selectedVersions.includes(version.versionId)}
                                    onChange={() => toggleVersion(version.versionId)}
                                    className="rounded"
                                  />
                                  <div className="flex items-center gap-2">
                                    <Settings className="w-3 h-3" />
                                    <Label 
                                      htmlFor={version.versionId}
                                      className="text-sm cursor-pointer"
                                    >
                                      {version.version} {version.engine && `(${version.engine})`}
                                    </Label>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Botões */}
              <div className="flex gap-2 pt-4 border-t">
                <Button 
                  onClick={handleCreatePart}
                  disabled={isCreatingPart || !newPart.sku || !newPart.description}
                  className="flex-1"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  {isCreatingPart ? 'Criando...' : 'Criar Peça'}
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => {
                    setNewPart({ sku: '', description: '' })
                    setSelectedVersions([])
                  }}
                >
                  Limpar
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Lista de peças existentes */}
        <div className="w-96">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="w-5 h-5" />
                Peças Cadastradas
              </CardTitle>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar peça..."
                  className="pl-9"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {loading ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Carregando...
                  </div>
                ) : parts.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Nenhuma peça encontrada
                  </div>
                ) : (
                  parts.map((part) => (
                    <div 
                      key={part.id}
                      className="p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                    >
                      <div className="space-y-1">
                        <div className="font-semibold">{part.description}</div>
                        <div className="text-sm text-muted-foreground">SKU: {part.sku}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
