export interface UnidadeSeed {
  id: string;
  designacao: string;
  name: string;
  address: string;
  bairro: string;
  telefone: string;
  diretor_geral: string;
  celular_diretor_geral: string;
  diretor_adjunto: string;
  celular_diretor_adjunto: string;
  origem: string;
}

export const GINFOTOS_UNIDADES: UnidadeSeed[] = [
  {
    "id": "6cre",
    "designacao": "6ªCRE",
    "name": "SEDE",
    "address": "RUA dos Abacates, s/nº",
    "bairro": "Deodoro",
    "telefone": "2457-0061",
    "diretor_geral": "",
    "celular_diretor_geral": "",
    "diretor_adjunto": "",
    "celular_diretor_adjunto": "",
    "origem": "Base oficial"
  }
];

export const GINFOTOS_UNIDADES_TOTAL = GINFOTOS_UNIDADES.length;
