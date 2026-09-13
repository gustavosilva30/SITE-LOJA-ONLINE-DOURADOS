/** Exibe CEP como 00000-000; armazene só dígitos no estado. */
export function formatCepMascara(digits: string | null | undefined): string {
    const d = String(digits || '').replace(/\D/g, '').slice(0, 8)
    if (d.length <= 5) return d
    return `${d.slice(0, 5)}-${d.slice(5)}`
}

export type EnderecoViaCep = {
    cep: string
    logradouro: string
    bairro: string
    localidade: string
    uf: string
    ibge: string
}

/** Consulta ViaCEP; `cep` no retorno são 8 dígitos. */
export async function buscarEnderecoPorCep(cepRaw: string): Promise<EnderecoViaCep> {
    const c = String(cepRaw || '').replace(/\D/g, '').slice(0, 8)
    if (c.length !== 8) {
        throw new Error('Informe um CEP com 8 dígitos.')
    }
    const res = await fetch(`https://viacep.com.br/ws/${c}/json/`)
    const data = await res.json()
    if (data.erro) {
        throw new Error('CEP não encontrado.')
    }
    const ibge = data.ibge ? String(data.ibge).replace(/\D/g, '').padStart(7, '0').slice(-7) : ''
    return {
        cep: c,
        logradouro: data.logradouro || '',
        bairro: data.bairro || '',
        localidade: data.localidade || '',
        uf: data.uf ? String(data.uf).toUpperCase().slice(0, 2) : '',
        ibge,
    }
}
