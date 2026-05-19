import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

interface UnidadeMapa {
  id: string;
  designacao?: string | null;
  name: string;
  address?: string | null;
  bairro?: string | null;
  telefone?: string | null;
  diretor_geral?: string | null;
  celular_diretor_geral?: string | null;
  diretor_adjunto?: string | null;
  celular_diretor_adjunto?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  origem?: string;
}

interface UserLocation {
  latitude: number;
  longitude: number;
}

const LOCAL_UNIDADES_KEY = 'ginfotos_unidades_local';

const fallbackUnidades: UnidadeMapa[] = [
  { id: '06-22-204', designacao: '06.22.204', name: 'GET JOAO DO RIO', address: '', bairro: '', origem: 'Base provisoria' },
  { id: '06-22-001', designacao: '06.22.001', name: 'EM GUILHERME TELL', address: '', bairro: '', origem: 'Base provisoria' },
  { id: '06-25-000', designacao: '06.25.000', name: 'EM ALZIRO ZARUR', address: '', bairro: '', origem: 'Base provisoria' }
];

function loadLocalUnidades(): UnidadeMapa[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_UNIDADES_KEY) || '[]') as UnidadeMapa[];
  } catch {
    return [];
  }
}

function normalizeUnidade(raw: Partial<UnidadeMapa>): UnidadeMapa {
  return {
    id: raw.id || `local-${Date.now()}-${Math.random()}`,
    designacao: raw.designacao || '',
    name: raw.name || 'Unidade sem nome',
    address: raw.address || '',
    bairro: raw.bairro || '',
    telefone: raw.telefone || '',
    diretor_geral: raw.diretor_geral || '',
    celular_diretor_geral: raw.celular_diretor_geral || '',
    diretor_adjunto: raw.diretor_adjunto || '',
    celular_diretor_adjunto: raw.celular_diretor_adjunto || '',
    latitude: raw.latitude ?? '',
    longitude: raw.longitude ?? '',
    origem: raw.origem || 'Local'
  };
}

function mergeUnidades(...groups: UnidadeMapa[][]) {
  const map = new Map<string, UnidadeMapa>();
  groups.flat().forEach((item) => {
    const normalized = normalizeUnidade(item);
    const key = String(normalized.designacao || normalized.id || normalized.name).toLowerCase();
    if (!map.has(key)) map.set(key, normalized);
  });
  return Array.from(map.values()).sort((a, b) => String(a.designacao || a.name).localeCompare(String(b.designacao || b.name)));
}

function toNumber(value?: number | string | null) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  return Number.isFinite(numeric) ? numeric : null;
}

function hasCoordinates(unit: UnidadeMapa) {
  return toNumber(unit.latitude) !== null && toNumber(unit.longitude) !== null;
}

function fullAddress(unit: UnidadeMapa) {
  const address = unit.address?.trim();
  const bairro = unit.bairro?.trim();
  const name = unit.name?.trim();
  const parts = [address, bairro, 'Rio de Janeiro RJ'].filter(Boolean);
  if (parts.length > 1) return parts.join(', ');
  return [name, bairro, 'Rio de Janeiro RJ'].filter(Boolean).join(', ');
}

function searchLabel(unit: UnidadeMapa) {
  return `${unit.designacao || ''} ${unit.name || ''} ${unit.address || ''} ${unit.bairro || ''} ${unit.diretor_geral || ''}`.toLowerCase();
}

function distanceInKm(unit: UnidadeMapa, userLocation: UserLocation | null) {
  const lat = toNumber(unit.latitude);
  const lng = toNumber(unit.longitude);
  if (!userLocation || lat === null || lng === null) return null;

  const earthRadiusKm = 6371;
  const dLat = ((lat - userLocation.latitude) * Math.PI) / 180;
  const dLng = ((lng - userLocation.longitude) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos((userLocation.latitude * Math.PI) / 180) * Math.cos((lat * Math.PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function mapsQuery(unit: UnidadeMapa) {
  const lat = toNumber(unit.latitude);
  const lng = toNumber(unit.longitude);
  if (lat !== null && lng !== null) return `${lat},${lng}`;
  return fullAddress(unit);
}

function googleMapsEmbedUrl(unit: UnidadeMapa) {
  return `https://www.google.com/maps?q=${encodeURIComponent(mapsQuery(unit))}&output=embed`;
}

function googleMapsOpenUrl(unit: UnidadeMapa) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery(unit))}`;
}

function wazeUrl(unit: UnidadeMapa) {
  const lat = toNumber(unit.latitude);
  const lng = toNumber(unit.longitude);
  if (lat !== null && lng !== null) return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
  return `https://waze.com/ul?q=${encodeURIComponent(fullAddress(unit))}&navigate=yes`;
}

export default function MapaUnidades() {
  const [unidades, setUnidades] = useState<UnidadeMapa[]>(fallbackUnidades);
  const [selectedId, setSelectedId] = useState(fallbackUnidades[0].id);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'mapa' | 'lista'>('mapa');
  const [notice, setNotice] = useState('');
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [nearestFirst, setNearestFirst] = useState(false);

  const loadUnidades = async () => {
    const local = loadLocalUnidades().map((item) => ({ ...item, origem: item.origem || 'Local' }));
    const initial = mergeUnidades(local, fallbackUnidades);
    setUnidades(initial);
    setSelectedId((current) => initial.find((item) => item.id === current)?.id || initial[0]?.id || '');
    setNotice('Mapa carregado com a base local do app.');

    try {
      const { data, error } = await supabase
        .from('unidades')
        .select('id, name, address, designacao, bairro, telefone, diretor_geral, celular_diretor_geral, diretor_adjunto, celular_diretor_adjunto, latitude, longitude')
        .order('name');

      if (!error && data && data.length > 0) {
        const remote = (data as UnidadeMapa[]).map((item: UnidadeMapa) => ({ ...item, origem: 'Supabase' }));
        const merged = mergeUnidades(local, remote, fallbackUnidades);
        setUnidades(merged);
        setSelectedId((current) => merged.find((item) => item.id === current)?.id || merged[0]?.id || '');
        setNotice('Mapa carregado com unidades locais e Supabase.');
      }
    } catch {
      setNotice('Supabase não respondeu. O mapa continua funcionando com a base local/importada.');
    }
  };

  useEffect(() => {
    loadUnidades();
  }, []);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    const result = term ? unidades.filter((unit) => searchLabel(unit).includes(term)) : [...unidades];
    if (nearestFirst) {
      result.sort((a, b) => {
        const da = distanceInKm(a, userLocation);
        const db = distanceInKm(b, userLocation);
        if (da === null && db === null) return String(a.designacao || a.name).localeCompare(String(b.designacao || b.name));
        if (da === null) return 1;
        if (db === null) return -1;
        return da - db;
      });
    }
    return result;
  }, [query, unidades, nearestFirst, userLocation]);

  const selected = useMemo(() => unidades.find((unit) => unit.id === selectedId) || filtered[0] || unidades[0], [selectedId, unidades, filtered]);
  const unitsWithCoordinates = unidades.filter(hasCoordinates).length;

  const requestUserLocation = () => {
    if (!navigator.geolocation) {
      setNotice('Este navegador não liberou localização.');
      return;
    }
    setNotice('Buscando sua localização...');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        setNearestFirst(true);
        setNotice('Localização ativada. A lista pode ser ordenada por proximidade quando a unidade tiver latitude/longitude.');
      },
      () => setNotice('Não foi possível obter sua localização. Verifique a permissão do navegador.'),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 300000 }
    );
  };

  const openExternal = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const selectUnit = (unit: UnidadeMapa) => {
    setSelectedId(unit.id);
    setTab('mapa');
  };

  return (
    <div className="dashboard-page">
      <div className="top-row">
        <div>
          <p className="page-label">Geolocalização</p>
          <h1>Mapa das Unidades</h1>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="empty-button" onClick={requestUserLocation}>Minha localização</button>
          <button type="button" className="empty-button" onClick={loadUnidades}>Atualizar</button>
          <span className="status-pill">{filtered.length} unidade(s)</span>
        </div>
      </div>

      <section className="page-card">
        <p className="page-description">Busque uma unidade, visualize no mapa e abra rota no Waze ou Google Maps com poucos cliques.</p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginTop: 16 }}>
          <input aria-label="Buscar escola ou bairro" placeholder="Buscar por escola, designação, bairro, endereço ou diretor" value={query} onChange={(event) => setQuery(event.target.value)} style={{ flex: '1 1 320px' }} />
          <button type="button" className={tab === 'mapa' ? 'primary' : 'empty-button'} onClick={() => setTab('mapa')}>Mapa</button>
          <button type="button" className={tab === 'lista' ? 'primary' : 'empty-button'} onClick={() => setTab('lista')}>Lista</button>
          <button type="button" className="empty-button" onClick={() => { if (!userLocation) requestUserLocation(); setNearestFirst((value) => !value); }}>{nearestFirst ? 'Proximidade ativa' : 'Filtrar por proximidade'}</button>
        </div>
        {notice && <p className="notice">{notice}</p>}
        {unitsWithCoordinates === 0 && <p className="notice">A base atual ainda não tem latitude/longitude. Mesmo assim, o mapa abre a unidade pelo endereço e os botões de rota funcionam pelo Waze/Google Maps.</p>}
      </section>

      {tab === 'mapa' && selected && (
        <section className="page-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(320px, 0.8fr)', gap: 0 }}>
            <div style={{ minHeight: 520, background: '#dbeafe' }}>
              <iframe title="Mapa da unidade escolar" src={googleMapsEmbedUrl(selected)} width="100%" height="520" style={{ border: 0, display: 'block' }} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
            </div>
            <aside style={{ padding: 22, borderLeft: '1px solid #dbe3ef', background: '#fff' }}>
              <p className="page-label">Unidade selecionada</p>
              <h2 style={{ marginTop: 6 }}>{selected.designacao ? `${selected.designacao} - ${selected.name}` : selected.name}</h2>
              <p className="page-description"><strong>Endereço:</strong> {selected.address || 'Não informado'}</p>
              <p className="page-description"><strong>Bairro:</strong> {selected.bairro || 'Não informado'}</p>
              <p className="page-description"><strong>Diretor(a):</strong> {selected.diretor_geral || 'Não informado'}</p>
              <p className="page-description"><strong>Telefone:</strong> {selected.telefone || 'Não informado'}</p>
              <p className="page-description"><strong>Distância:</strong> {distanceInKm(selected, userLocation) === null ? 'Indisponível' : `${distanceInKm(selected, userLocation)?.toFixed(1)} km`}</p>
              <div style={{ display: 'grid', gap: 10, marginTop: 18 }}>
                <button type="button" className="primary large" onClick={() => openExternal(wazeUrl(selected))}>Abrir no Waze</button>
                <button type="button" className="empty-button" onClick={() => openExternal(googleMapsOpenUrl(selected))}>Abrir no Google Maps</button>
                <button type="button" className="empty-button" onClick={() => setTab('lista')}>Ver lista de unidades</button>
              </div>
            </aside>
          </div>
        </section>
      )}

      {tab === 'lista' && (
        <section className="page-card">
          <div style={{ overflowX: 'auto' }}>
            <table className="table-list">
              <thead>
                <tr>
                  <th>Designação</th>
                  <th>Unidade</th>
                  <th>Bairro</th>
                  <th>Endereço</th>
                  <th>Distância</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((unit) => {
                  const distance = distanceInKm(unit, userLocation);
                  return (
                    <tr key={unit.id}>
                      <td>{unit.designacao || '—'}</td>
                      <td><strong>{unit.name}</strong><br /><span className="page-description">{unit.diretor_geral || 'Direção não informada'}</span></td>
                      <td>{unit.bairro || '—'}</td>
                      <td>{unit.address || '—'}</td>
                      <td>{distance === null ? '—' : `${distance.toFixed(1)} km`}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button type="button" className="empty-link" onClick={() => selectUnit(unit)}>Ver mapa</button>
                          <button type="button" className="empty-link" onClick={() => openExternal(wazeUrl(unit))}>Waze</button>
                          <button type="button" className="empty-link" onClick={() => openExternal(googleMapsOpenUrl(unit))}>Google Maps</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
