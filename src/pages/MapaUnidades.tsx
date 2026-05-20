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

interface RouteStop extends UnidadeMapa {
  routeDistanceFromPrevious?: number | null;
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

function coordinatePoint(unit: UnidadeMapa): UserLocation | null {
  const lat = toNumber(unit.latitude);
  const lng = toNumber(unit.longitude);
  if (lat === null || lng === null) return null;
  return { latitude: lat, longitude: lng };
}

function hasCoordinates(unit: UnidadeMapa) {
  return coordinatePoint(unit) !== null;
}

function fullAddress(unit: UnidadeMapa) {
  const address = unit.address?.trim();
  const bairro = unit.bairro?.trim();
  const name = unit.name?.trim();
  const parts = [address, bairro, 'Rio de Janeiro RJ'].filter(Boolean);
  if (parts.length > 1) return parts.join(', ');
  return [name, bairro, 'Rio de Janeiro RJ'].filter(Boolean).join(', ');
}

function normalizeText(value?: string | null) {
  return String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function sameNeighborhood(a: UnidadeMapa, b: UnidadeMapa) {
  const bairroA = normalizeText(a.bairro);
  const bairroB = normalizeText(b.bairro);
  return Boolean(bairroA && bairroB && bairroA === bairroB);
}

function searchLabel(unit: UnidadeMapa) {
  return `${unit.designacao || ''} ${unit.name || ''} ${unit.address || ''} ${unit.bairro || ''} ${unit.diretor_geral || ''}`.toLowerCase();
}

function pointDistanceKm(origin: UserLocation, destination: UserLocation) {
  const earthRadiusKm = 6371;
  const dLat = ((destination.latitude - origin.latitude) * Math.PI) / 180;
  const dLng = ((destination.longitude - origin.longitude) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos((origin.latitude * Math.PI) / 180) * Math.cos((destination.latitude * Math.PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function distanceInKm(unit: UnidadeMapa, userLocation: UserLocation | null) {
  const point = coordinatePoint(unit);
  if (!userLocation || !point) return null;
  return pointDistanceKm(userLocation, point);
}

function mapsQuery(unit: UnidadeMapa) {
  const point = coordinatePoint(unit);
  if (point) return `${point.latitude},${point.longitude}`;
  return fullAddress(unit);
}

function googleMapsEmbedUrl(unit: UnidadeMapa) {
  return `https://www.google.com/maps?q=${encodeURIComponent(mapsQuery(unit))}&output=embed`;
}

function googleMapsOpenUrl(unit: UnidadeMapa) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery(unit))}`;
}

function wazeUrl(unit: UnidadeMapa) {
  const point = coordinatePoint(unit);
  if (point) return `https://waze.com/ul?ll=${point.latitude},${point.longitude}&navigate=yes`;
  return `https://waze.com/ul?q=${encodeURIComponent(fullAddress(unit))}&navigate=yes`;
}

function stopTitle(unit: UnidadeMapa) {
  return unit.designacao ? `${unit.designacao} - ${unit.name}` : unit.name;
}

function sortByNeighborhoodAndName(units: UnidadeMapa[], anchor?: UnidadeMapa) {
  return units.slice().sort((a, b) => {
    if (anchor) {
      const aSame = sameNeighborhood(anchor, a) ? 0 : 1;
      const bSame = sameNeighborhood(anchor, b) ? 0 : 1;
      if (aSame !== bSame) return aSame - bSame;
    }
    const bairroCompare = String(a.bairro || '').localeCompare(String(b.bairro || ''));
    if (bairroCompare !== 0) return bairroCompare;
    return String(a.designacao || a.name).localeCompare(String(b.designacao || b.name));
  });
}

function buildRouteStops(units: UnidadeMapa[], start: UserLocation | null, maxStops: number) {
  const candidates = units.filter((unit) => unit.name && unit.name !== 'Unidade sem nome');
  const withCoordinates = candidates.filter(hasCoordinates);
  const withoutCoordinates = candidates.filter((unit) => !hasCoordinates(unit));
  const ordered: RouteStop[] = [];

  if (start && withCoordinates.length > 0) {
    const available = withCoordinates.slice();
    let current = start;

    while (available.length > 0 && ordered.length < maxStops) {
      let bestIndex = 0;
      let bestDistance = Number.POSITIVE_INFINITY;

      available.forEach((unit, index) => {
        const point = coordinatePoint(unit);
        if (!point) return;
        const distance = pointDistanceKm(current, point);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = index;
        }
      });

      const [next] = available.splice(bestIndex, 1);
      ordered.push({ ...next, routeDistanceFromPrevious: bestDistance });
      const nextPoint = coordinatePoint(next);
      if (nextPoint) current = nextPoint;
    }
  } else {
    withCoordinates.slice(0, maxStops).forEach((unit) => ordered.push({ ...unit, routeDistanceFromPrevious: null }));
  }

  if (ordered.length < maxStops) {
    const usedIds = new Set(ordered.map((unit) => unit.id));
    const remaining = sortByNeighborhoodAndName([...withCoordinates, ...withoutCoordinates].filter((unit) => !usedIds.has(unit.id)));
    remaining.slice(0, maxStops - ordered.length).forEach((unit) => ordered.push({ ...unit, routeDistanceFromPrevious: null }));
  }

  return ordered;
}

function buildRouteNearAnchor(anchor: UnidadeMapa, allUnits: UnidadeMapa[], maxStops: number) {
  const anchorPoint = coordinatePoint(anchor);
  const candidates = allUnits.filter((unit) => unit.id !== anchor.id && unit.name && unit.name !== 'Unidade sem nome');
  const sameBairro = candidates.filter((unit) => sameNeighborhood(anchor, unit));
  const base = sameBairro.length > 0 ? sameBairro : candidates;

  let nextStops: RouteStop[] = [];
  if (anchorPoint) {
    nextStops = buildRouteStops(base, anchorPoint, Math.max(0, maxStops - 1));
  } else {
    nextStops = sortByNeighborhoodAndName(base, anchor).slice(0, Math.max(0, maxStops - 1)).map((unit) => ({ ...unit, routeDistanceFromPrevious: null }));
  }

  return [{ ...anchor, routeDistanceFromPrevious: null }, ...nextStops].slice(0, maxStops);
}

function googleRouteUrl(stops: RouteStop[], userLocation: UserLocation | null) {
  if (stops.length === 0) return '';
  const limitedStops = stops.slice(0, 10);

  if (limitedStops.length === 1) {
    const params = new URLSearchParams({ api: '1', destination: mapsQuery(limitedStops[0]), travelmode: 'driving' });
    if (userLocation) params.set('origin', `${userLocation.latitude},${userLocation.longitude}`);
    return `https://www.google.com/maps/dir/?${params.toString()}`;
  }

  const first = limitedStops[0];
  const last = limitedStops[limitedStops.length - 1];
  const middle = userLocation ? limitedStops.slice(0, -1) : limitedStops.slice(1, -1);
  const origin = userLocation ? `${userLocation.latitude},${userLocation.longitude}` : mapsQuery(first);
  const destination = mapsQuery(last);
  const waypoints = middle.map(mapsQuery).join('|');
  const params = new URLSearchParams({ api: '1', origin, destination, travelmode: 'driving' });
  if (waypoints) params.set('waypoints', waypoints);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function routeText(stops: RouteStop[]) {
  return stops.map((unit, index) => `${index + 1}. ${stopTitle(unit)} - ${unit.address || 'Endereço não informado'} - ${unit.bairro || ''}`).join('\n');
}

export default function MapaUnidades() {
  const [unidades, setUnidades] = useState<UnidadeMapa[]>(fallbackUnidades);
  const [selectedId, setSelectedId] = useState(fallbackUnidades[0].id);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'mapa' | 'lista' | 'rotas'>('mapa');
  const [notice, setNotice] = useState('');
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [nearestFirst, setNearestFirst] = useState(false);
  const [routeLimit, setRouteLimit] = useState(6);
  const [routeStops, setRouteStops] = useState<RouteStop[]>([]);
  const [routeMode, setRouteMode] = useState('');

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
  const filteredWithCoordinates = filtered.filter(hasCoordinates).length;
  const totalRouteKm = routeStops.reduce((total, stop) => total + (stop.routeDistanceFromPrevious || 0), 0);

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
        setNotice('Localização ativada. Agora você pode gerar rota por proximidade quando as unidades tiverem coordenadas.');
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

  const generateDailyRoute = () => {
    const candidates = filtered.filter((unit) => unit.name && unit.name !== 'Unidade sem nome');
    if (candidates.length === 0) {
      setNotice('Nenhuma unidade encontrada no filtro atual. Limpe a busca ou pesquise outro bairro.');
      return;
    }

    let route: RouteStop[];
    let anchor: UnidadeMapa | null = null;
    const isAnchorSearch = query.trim().length > 0 && candidates.length === 1;

    if (isAnchorSearch) {
      anchor = candidates[0];
      route = buildRouteNearAnchor(anchor, unidades, routeLimit);
      setRouteMode(`Rota a partir de ${stopTitle(anchor)}`);
    } else {
      route = buildRouteStops(candidates, userLocation, routeLimit);
      setRouteMode(query.trim() ? `Rota do filtro: ${query.trim()}` : 'Rota geral');
    }

    setRouteStops(route);
    setTab('rotas');

    const routeWithCoordinates = route.filter(hasCoordinates).length;
    if (anchor) {
      const sameBairroCount = route.filter((unit) => unit.id !== anchor?.id && sameNeighborhood(anchor as UnidadeMapa, unit)).length;
      setNotice(`Rota criada a partir da escola pesquisada. Incluí ${sameBairroCount} unidade(s) do mesmo bairro e próximas na sequência.`);
    } else if (!userLocation && routeWithCoordinates > 0) {
      setNotice(`Rota criada com ${route.length} unidade(s). Para ordenar pela sua localização exata, clique em Minha localização.`);
    } else if (routeWithCoordinates === 0) {
      setNotice(`Rota criada com ${route.length} unidade(s) pelo endereço. Para cálculo real de proximidade, preencha latitude/longitude das unidades.`);
    } else if (routeWithCoordinates < route.length) {
      setNotice(`Rota criada com ${route.length} unidade(s). As unidades sem latitude/longitude foram colocadas no final.`);
    } else {
      setNotice(`Rota diária criada com ${route.length} unidade(s), em ordem aproximada de proximidade.`);
    }
  };

  const removeRouteStop = (id: string) => {
    setRouteStops((current) => current.filter((item) => item.id !== id));
  };

  const openGoogleRoute = () => {
    if (routeStops.length === 0) {
      setNotice('Gere uma rota diária primeiro.');
      return;
    }
    if (routeStops.length > 10) {
      setNotice('O Google Maps será aberto com as 10 primeiras paradas da rota.');
    }
    openExternal(googleRouteUrl(routeStops, userLocation));
  };

  const copyRoute = async () => {
    if (routeStops.length === 0) {
      setNotice('Gere uma rota diária primeiro.');
      return;
    }
    const text = `ROTA DIÁRIA - GINFOTOS 6ª CRE\n${routeMode ? `${routeMode}\n` : ''}\n${routeText(routeStops)}`;
    try {
      await navigator.clipboard.writeText(text);
      setNotice('Roteiro copiado. Você pode colar no WhatsApp ou em uma mensagem.');
    } catch {
      setNotice('Não consegui copiar automaticamente. Selecione a lista da rota e copie manualmente.');
    }
  };

  const nextStop = routeStops[0];

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
        <p className="page-description">Para achar escolas próximas de uma unidade, pesquise a escola desejada e clique em Gerar rota diária. O app coloca essa escola como ponto de partida e busca unidades do mesmo bairro/próximas.</p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginTop: 16 }}>
          <input aria-label="Buscar escola ou bairro" placeholder="Buscar por bairro, escola, designação, endereço ou diretor" value={query} onChange={(event) => setQuery(event.target.value)} style={{ flex: '1 1 320px' }} />
          <button type="button" className={tab === 'mapa' ? 'primary' : 'empty-button'} onClick={() => setTab('mapa')}>Mapa</button>
          <button type="button" className={tab === 'lista' ? 'primary' : 'empty-button'} onClick={() => setTab('lista')}>Lista</button>
          <button type="button" className={tab === 'rotas' ? 'primary' : 'empty-button'} onClick={() => setTab('rotas')}>Rotas do dia</button>
          <button type="button" className="empty-button" onClick={() => { if (!userLocation) requestUserLocation(); setNearestFirst((value) => !value); }}>{nearestFirst ? 'Proximidade ativa' : 'Filtrar por proximidade'}</button>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginTop: 14 }}>
          <label className="page-description" htmlFor="routeLimit" style={{ margin: 0 }}>Quantidade de escolas na rota:</label>
          <select id="routeLimit" value={routeLimit} onChange={(event) => setRouteLimit(Number(event.target.value))} style={{ maxWidth: 110 }}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <button type="button" className="primary" onClick={generateDailyRoute}>Gerar rota diária</button>
        </div>
        {notice && <p className="notice">{notice}</p>}
        {unitsWithCoordinates === 0 && <p className="notice">A base atual ainda não tem latitude/longitude. A rota será gerada pelo endereço e pelo bairro. Para proximidade real, preencha as coordenadas na aba Unidades Escolares.</p>}
      </section>

      {tab === 'rotas' && (
        <section className="page-card">
          <div className="recent-header">
            <div>
              <p className="page-label">Planejamento diário</p>
              <h2>Rotas do dia</h2>
              <p className="page-description">{routeMode || `Unidades com coordenadas no filtro atual: ${filteredWithCoordinates}. Sem coordenadas, a rota usa bairro/endereço.`}</p>
            </div>
            <span className="status-pill">{routeStops.length} parada(s)</span>
          </div>

          {routeStops.length === 0 ? (
            <div className="empty-state">
              <p>Pesquise uma escola específica para gerar uma rota a partir dela, ou pesquise um bairro para montar uma rota do bairro.</p>
              <button type="button" className="empty-button" onClick={generateDailyRoute}>Gerar rota agora</button>
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12, marginBottom: 18 }}>
                <article className="stat-card"><div className="stat-icon">🚗</div><div><p className="stat-value">{routeStops.length}</p><p className="stat-label">Paradas</p></div></article>
                <article className="stat-card"><div className="stat-icon">📍</div><div><p className="stat-value">{totalRouteKm.toFixed(1)} km</p><p className="stat-label">Distância aproximada</p></div></article>
                <article className="stat-card"><div className="stat-icon">▶️</div><div><p className="stat-value">1ª</p><p className="stat-label">{nextStop ? stopTitle(nextStop) : 'Sem parada'}</p></div></article>
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
                <button type="button" className="primary" onClick={openGoogleRoute}>Abrir rota completa no Google Maps</button>
                {nextStop && <button type="button" className="empty-button" onClick={() => openExternal(wazeUrl(nextStop))}>Abrir próxima no Waze</button>}
                <button type="button" className="empty-button" onClick={copyRoute}>Copiar roteiro</button>
                <button type="button" className="empty-button" onClick={() => setRouteStops([])}>Limpar rota</button>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table className="table-list">
                  <thead>
                    <tr>
                      <th>Ordem</th>
                      <th>Unidade</th>
                      <th>Bairro</th>
                      <th>Endereço</th>
                      <th>Trecho aprox.</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {routeStops.map((unit, index) => (
                      <tr key={`route-${unit.id}`}>
                        <td><strong>{index + 1}</strong></td>
                        <td><strong>{stopTitle(unit)}</strong><br /><span className="page-description">{unit.diretor_geral || 'Direção não informada'}</span></td>
                        <td>{unit.bairro || '—'}</td>
                        <td>{unit.address || '—'}</td>
                        <td>{unit.routeDistanceFromPrevious === null || unit.routeDistanceFromPrevious === undefined ? (index === 0 ? 'Ponto inicial' : 'Mesmo bairro/endereço') : `${unit.routeDistanceFromPrevious.toFixed(1)} km`}</td>
                        <td><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button type="button" className="empty-link" onClick={() => selectUnit(unit)}>Mapa</button><button type="button" className="empty-link" onClick={() => openExternal(wazeUrl(unit))}>Waze</button><button type="button" className="empty-link danger-link" onClick={() => removeRouteStop(unit.id)}>Remover</button></div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}

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
                <button type="button" className="empty-button" onClick={() => { setQuery(selected.name); setTab('rotas'); }}>Montar rota a partir desta escola</button>
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
                          <button type="button" className="empty-link" onClick={() => { setQuery(unit.name); setTab('rotas'); }}>Rota a partir daqui</button>
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
