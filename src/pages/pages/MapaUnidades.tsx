import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { GeoJSONSource, Map as MapLibreMap, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
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

interface SchoolFeatureCollection {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    geometry: { type: 'Point'; coordinates: [number, number] };
    properties: { id: string; title: string; bairro: string };
  }>;
}

const LOCAL_UNIDADES_KEY = 'ginfotos_unidades_local';
const DEFAULT_CENTER: [number, number] = [-43.3102, -22.8246];

const fallbackUnidades: UnidadeMapa[] = [
  { id: '06-22-204', designacao: '06.22.204', name: 'GET JOAO DO RIO', address: '', bairro: '', origem: 'Base provisória' },
  { id: '06-22-001', designacao: '06.22.001', name: 'EM GUILHERME TELL', address: '', bairro: '', origem: 'Base provisória' },
  { id: '06-25-000', designacao: '06.25.000', name: 'EM ALZIRO ZARUR', address: '', bairro: '', origem: 'Base provisória' }
];

function loadLocalUnidades(): UnidadeMapa[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_UNIDADES_KEY) || '[]') as UnidadeMapa[];
  } catch {
    return [];
  }
}

function hasValue(value: unknown) {
  return value !== null && value !== undefined && String(value).trim() !== '';
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
    const current = map.get(key);

    if (!current) {
      map.set(key, normalized);
      return;
    }

    map.set(key, {
      ...current,
      name: hasValue(current.name) && current.name !== 'Unidade sem nome' ? current.name : normalized.name,
      address: hasValue(current.address) ? current.address : normalized.address,
      bairro: hasValue(current.bairro) ? current.bairro : normalized.bairro,
      telefone: hasValue(current.telefone) ? current.telefone : normalized.telefone,
      diretor_geral: hasValue(current.diretor_geral) ? current.diretor_geral : normalized.diretor_geral,
      celular_diretor_geral: hasValue(current.celular_diretor_geral) ? current.celular_diretor_geral : normalized.celular_diretor_geral,
      diretor_adjunto: hasValue(current.diretor_adjunto) ? current.diretor_adjunto : normalized.diretor_adjunto,
      celular_diretor_adjunto: hasValue(current.celular_diretor_adjunto) ? current.celular_diretor_adjunto : normalized.celular_diretor_adjunto,
      latitude: hasValue(current.latitude) ? current.latitude : normalized.latitude,
      longitude: hasValue(current.longitude) ? current.longitude : normalized.longitude,
      origem: current.origem || normalized.origem
    });
  });

  return Array.from(map.values()).sort((a, b) => String(a.designacao || a.name).localeCompare(String(b.designacao || b.name)));
}

function toNumber(value?: number | string | null) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  return Number.isFinite(numeric) ? numeric : null;
}

function coordinatePoint(unit: UnidadeMapa): UserLocation | null {
  const latitude = toNumber(unit.latitude);
  const longitude = toNumber(unit.longitude);
  if (latitude === null || longitude === null) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

function hasCoordinates(unit: UnidadeMapa) {
  return coordinatePoint(unit) !== null;
}

function fullAddress(unit: UnidadeMapa) {
  return [unit.address?.trim(), unit.bairro?.trim(), 'Rio de Janeiro - RJ'].filter(Boolean).join(', ');
}

function routeDestination(unit: UnidadeMapa) {
  const point = coordinatePoint(unit);
  return point ? `${point.latitude},${point.longitude}` : fullAddress(unit) || unit.name;
}

function wazeUrl(unit: UnidadeMapa) {
  const point = coordinatePoint(unit);
  if (point) return `https://waze.com/ul?ll=${point.latitude},${point.longitude}&navigate=yes`;
  return `https://waze.com/ul?q=${encodeURIComponent(fullAddress(unit) || unit.name)}&navigate=yes`;
}

function googleMapsUrl(unit: UnidadeMapa) {
  const destination = encodeURIComponent(routeDestination(unit));
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;
}

function normalizeText(value?: string | null) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function searchLabel(unit: UnidadeMapa) {
  return normalizeText(`${unit.designacao || ''} ${unit.name || ''} ${unit.address || ''} ${unit.bairro || ''} ${unit.diretor_geral || ''}`);
}

function pointDistanceKm(origin: UserLocation, destination: UserLocation) {
  const earthRadiusKm = 6371;
  const dLat = ((destination.latitude - origin.latitude) * Math.PI) / 180;
  const dLng = ((destination.longitude - origin.longitude) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos((origin.latitude * Math.PI) / 180)
    * Math.cos((destination.latitude * Math.PI) / 180)
    * Math.sin(dLng / 2) ** 2;
  return earthRadiusKm * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function distanceInKm(unit: UnidadeMapa, userLocation: UserLocation | null) {
  const point = coordinatePoint(unit);
  if (!userLocation || !point) return null;
  return pointDistanceKm(userLocation, point);
}

function distanceLabel(unit: UnidadeMapa, userLocation: UserLocation | null) {
  const distance = distanceInKm(unit, userLocation);
  if (distance === null) return 'Distância indisponível';
  if (distance < 1) return `${Math.round(distance * 1000)} m de você`;
  return `${distance.toFixed(1)} km de você`;
}

function stopTitle(unit: UnidadeMapa) {
  return unit.designacao ? `${unit.designacao} - ${unit.name}` : unit.name;
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
    [...withCoordinates, ...withoutCoordinates]
      .filter((unit) => !usedIds.has(unit.id))
      .slice(0, maxStops - ordered.length)
      .forEach((unit) => ordered.push({ ...unit, routeDistanceFromPrevious: null }));
  }

  return ordered;
}

function googleRouteUrl(stops: RouteStop[], userLocation: UserLocation | null) {
  if (stops.length === 0) return '';
  const limited = stops.slice(0, 10);
  const last = limited[limited.length - 1];
  const origin = userLocation
    ? `${userLocation.latitude},${userLocation.longitude}`
    : routeDestination(limited[0]);
  const middle = limited.length > 1 ? limited.slice(0, -1).map(routeDestination).join('|') : '';
  const params = new URLSearchParams({
    api: '1',
    origin,
    destination: routeDestination(last),
    travelmode: 'driving'
  });
  if (middle) params.set('waypoints', middle);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function schoolsGeoJson(units: UnidadeMapa[]): SchoolFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: units.flatMap((unit) => {
      const point = coordinatePoint(unit);
      if (!point) return [];
      return [{
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [point.longitude, point.latitude] as [number, number] },
        properties: { id: unit.id, title: stopTitle(unit), bairro: unit.bairro || '' }
      }];
    })
  };
}

export default function MapaUnidades() {
  const [unidades, setUnidades] = useState<UnidadeMapa[]>(fallbackUnidades);
  const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'mapa' | 'lista' | 'rotas'>('mapa');
  const [notice, setNotice] = useState('Carregando unidades...');
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [nearestFirst, setNearestFirst] = useState(false);
  const [locating, setLocating] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [routeLimit, setRouteLimit] = useState(6);
  const [routeStops, setRouteStops] = useState<RouteStop[]>([]);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const userMarkerRef = useRef<Marker | null>(null);
  const unitsRef = useRef<UnidadeMapa[]>(unidades);
  const firstFitRef = useRef(false);

  useEffect(() => {
    unitsRef.current = unidades;
  }, [unidades]);

  const loadUnidades = async () => {
    const local = loadLocalUnidades().map((item) => ({ ...item, origem: item.origem || 'Local' }));
    const initial = mergeUnidades(local, fallbackUnidades);
    setUnidades(initial);
    setNotice(`${initial.length} unidade(s) disponíveis no dispositivo. Atualizando base...`);

    try {
      const { data, error } = await supabase
        .from('unidades')
        .select('id, name, address, designacao, bairro, telefone, diretor_geral, celular_diretor_geral, diretor_adjunto, celular_diretor_adjunto, latitude, longitude')
        .order('designacao');

      if (!error && data && data.length > 0) {
        const remote = (data as UnidadeMapa[]).map((item) => ({ ...item, origem: 'Supabase' }));
        const merged = mergeUnidades(local, remote, fallbackUnidades);
        setUnidades(merged);
        setNotice(`${merged.length} unidade(s) carregadas. ${merged.filter(hasCoordinates).length} já aparecem no mapa.`);
      } else if (error) {
        setNotice(`Base online indisponível. O mapa continua com os dados salvos no dispositivo.`);
      } else {
        setNotice(`${initial.length} unidade(s) carregadas da base local.`);
      }
    } catch {
      setNotice('Base online não respondeu. O mapa continua funcionando com os dados salvos no dispositivo.');
    }
  };

  useEffect(() => {
    loadUnidades();
  }, []);

  const filtered = useMemo(() => {
    const term = normalizeText(query);
    const result = term ? unidades.filter((unit) => searchLabel(unit).includes(term)) : [...unidades];

    if (nearestFirst && userLocation) {
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

  const filteredWithCoordinates = useMemo(() => filtered.filter(hasCoordinates), [filtered]);
  const selected = useMemo(
    () => unidades.find((unit) => unit.id === selectedId) || null,
    [selectedId, unidades]
  );

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      center: DEFAULT_CENTER,
      zoom: 10.4,
      attributionControl: false,
      style: {
        version: 8,
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors'
          }
        },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }]
      }
    });

    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');

    map.on('load', () => {
      map.addSource('schools', {
        type: 'geojson',
        data: schoolsGeoJson([]),
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 52
      });

      map.addLayer({
        id: 'school-clusters',
        type: 'circle',
        source: 'schools',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': ['step', ['get', 'point_count'], '#315fc9', 15, '#243ca8', 40, '#10243f'],
          'circle-radius': ['step', ['get', 'point_count'], 20, 15, 26, 40, 32],
          'circle-stroke-width': 3,
          'circle-stroke-color': '#ffffff'
        }
      });

      map.addLayer({
        id: 'school-cluster-count',
        type: 'symbol',
        source: 'schools',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-size': 13,
          'text-font': ['Open Sans Regular']
        },
        paint: { 'text-color': '#ffffff' }
      });

      map.addLayer({
        id: 'school-points',
        type: 'circle',
        source: 'schools',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': '#315fc9',
          'circle-radius': 9,
          'circle-stroke-width': 3,
          'circle-stroke-color': '#ffffff'
        }
      });

      map.on('click', 'school-clusters', (event) => {
        const feature = map.queryRenderedFeatures(event.point, { layers: ['school-clusters'] })[0];
        if (!feature || feature.geometry.type !== 'Point') return;
        const coordinates = feature.geometry.coordinates as [number, number];
        map.easeTo({ center: coordinates, zoom: Math.min(map.getZoom() + 2.2, 16), duration: 550 });
      });

      map.on('click', 'school-points', (event) => {
        const feature = map.queryRenderedFeatures(event.point, { layers: ['school-points'] })[0];
        const id = String(feature?.properties?.id || '');
        if (!id) return;
        setSelectedId(id);
        if (feature?.geometry.type === 'Point') {
          map.easeTo({ center: feature.geometry.coordinates as [number, number], zoom: Math.max(map.getZoom(), 14.5), duration: 450 });
        }
      });

      ['school-clusters', 'school-points'].forEach((layerId) => {
        map.on('mouseenter', layerId, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', layerId, () => { map.getCanvas().style.cursor = ''; });
      });

      setMapReady(true);
    });

    return () => {
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const source = map.getSource('schools') as GeoJSONSource | undefined;
    source?.setData(schoolsGeoJson(filteredWithCoordinates));

    if (!firstFitRef.current && filteredWithCoordinates.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      filteredWithCoordinates.forEach((unit) => {
        const point = coordinatePoint(unit);
        if (point) bounds.extend([point.longitude, point.latitude]);
      });
      map.fitBounds(bounds, { padding: 70, maxZoom: 12.8, duration: 0 });
      firstFitRef.current = true;
    }
  }, [filteredWithCoordinates, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !userLocation) return;

    userMarkerRef.current?.remove();
    const markerElement = document.createElement('div');
    markerElement.className = 'map-user-marker';
    markerElement.title = 'Sua localização';
    userMarkerRef.current = new maplibregl.Marker({ element: markerElement })
      .setLngLat([userLocation.longitude, userLocation.latitude])
      .addTo(map);
  }, [userLocation, mapReady]);

  const openExternal = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const requestUserLocation = () => {
    if (!navigator.geolocation) {
      setNotice('Este aparelho/navegador não oferece localização.');
      return;
    }

    setLocating(true);
    setNotice('Buscando sua localização...');

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        setUserLocation(location);
        setNearestFirst(true);
        setLocating(false);
        setNotice('Localização ativada. A lista agora pode ordenar as escolas mais próximas.');
        mapRef.current?.easeTo({ center: [location.longitude, location.latitude], zoom: 13.5, duration: 650 });
      },
      (error) => {
        setLocating(false);
        if (error.code === error.PERMISSION_DENIED) setNotice('A localização foi bloqueada. Autorize a localização do site no navegador e tente novamente.');
        else if (error.code === error.TIMEOUT) setNotice('A localização demorou demais para responder. Tente novamente.');
        else setNotice('Não foi possível obter sua localização neste momento.');
      },
      { enableHighAccuracy: true, timeout: 9000, maximumAge: 120000 }
    );
  };

  const focusUnit = (unit: UnidadeMapa) => {
    setSelectedId(unit.id);
    setTab('mapa');
    const point = coordinatePoint(unit);
    if (point) mapRef.current?.easeTo({ center: [point.longitude, point.latitude], zoom: 15.2, duration: 600 });
  };

  const showAllPins = () => {
    const map = mapRef.current;
    if (!map || filteredWithCoordinates.length === 0) return;
    const bounds = new maplibregl.LngLatBounds();
    filteredWithCoordinates.forEach((unit) => {
      const point = coordinatePoint(unit);
      if (point) bounds.extend([point.longitude, point.latitude]);
    });
    map.fitBounds(bounds, { padding: 70, maxZoom: 13, duration: 650 });
  };

  const generateDailyRoute = () => {
    const route = buildRouteStops(filtered, userLocation, routeLimit);
    setRouteStops(route);
    setTab('rotas');
    setNotice(route.length > 0 ? `Rota criada com ${route.length} parada(s).` : 'Nenhuma unidade encontrada para criar a rota.');
  };

  const routeTotalKm = routeStops.reduce((sum, item) => sum + (item.routeDistanceFromPrevious || 0), 0);

  return (
    <div className="dashboard-page map-units-page">
      <div className="top-row">
        <div>
          <p className="page-label">Geolocalização</p>
          <h1>Mapa das Unidades</h1>
        </div>
        <div className="top-actions">
          <button type="button" className="empty-button" onClick={requestUserLocation} disabled={locating}>
            {locating ? 'Localizando...' : '📍 Minha localização'}
          </button>
          <button type="button" className="empty-button" onClick={loadUnidades}>Atualizar</button>
          <span className="status-pill">{filtered.length} unidade(s)</span>
        </div>
      </div>

      <section className="page-card map-search-card">
        <div className="map-search-row">
          <div className="map-search-input-wrap">
            <span aria-hidden="true">🔎</span>
            <input
              aria-label="Buscar escola ou bairro"
              placeholder="Buscar por escola, designação, bairro, endereço ou diretor"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query && <button type="button" className="map-clear-search" onClick={() => setQuery('')} aria-label="Limpar busca">×</button>}
          </div>
          <button type="button" className={tab === 'mapa' ? 'primary' : 'empty-button'} onClick={() => setTab('mapa')}>🗺️ Mapa</button>
          <button type="button" className={tab === 'lista' ? 'primary' : 'empty-button'} onClick={() => setTab('lista')}>☰ Lista</button>
          <button type="button" className={tab === 'rotas' ? 'primary' : 'empty-button'} onClick={() => setTab('rotas')}>🚗 Rotas</button>
        </div>

        <div className="map-filter-row">
          <button
            type="button"
            className={nearestFirst ? 'map-filter-chip active' : 'map-filter-chip'}
            onClick={() => {
              if (!userLocation) requestUserLocation();
              else setNearestFirst((value) => !value);
            }}
          >
            📌 {nearestFirst ? 'Mais próximas primeiro' : 'Ordenar por proximidade'}
          </button>
          <span className="map-helper-text">{filteredWithCoordinates.length} com localização no mapa</span>
          {filtered.length - filteredWithCoordinates.length > 0 && (
            <span className="map-helper-text warning">{filtered.length - filteredWithCoordinates.length} sem coordenadas</span>
          )}
        </div>

        {notice && <p className="map-notice">{notice}</p>}
      </section>

      {tab === 'mapa' && (
        <section className="page-card map-main-card">
          <div className="map-toolbar">
            <div>
              <strong>Unidades escolares da 6ª CRE</strong>
              <span>Toque em um ponto para ver a escola e abrir a rota.</span>
            </div>
            <button type="button" className="empty-button" onClick={showAllPins}>Ver todos os pins</button>
          </div>

          <div className="map-stage">
            <div ref={mapContainerRef} className="school-map-canvas" aria-label="Mapa das unidades escolares" />

            {!mapReady && <div className="map-loading-overlay">Carregando mapa...</div>}

            {mapReady && filteredWithCoordinates.length === 0 && (
              <div className="map-empty-overlay">
                <strong>Nenhuma escola deste filtro possui coordenadas.</strong>
                <span>A unidade continua disponível na Lista e pode ser aberta no Waze ou Google Maps pelo endereço.</span>
                <button type="button" className="empty-button" onClick={() => setTab('lista')}>Abrir Lista</button>
              </div>
            )}

            <button type="button" className="map-location-fab" onClick={requestUserLocation} title="Centralizar na minha localização" aria-label="Minha localização">⌖</button>

            {selected && (
              <aside className="map-school-sheet">
                <button type="button" className="map-sheet-close" onClick={() => setSelectedId('')} aria-label="Fechar">×</button>
                <div className="map-school-heading">
                  <div className="map-school-icon">🏫</div>
                  <div>
                    <span className="map-school-designation">{selected.designacao || 'Unidade escolar'}</span>
                    <h2>{selected.name}</h2>
                  </div>
                </div>
                <p className="map-school-address">📍 {fullAddress(selected) || 'Endereço não informado'}</p>
                <div className="map-distance-pill">⌖ {distanceLabel(selected, userLocation)}</div>
                <div className="map-school-actions">
                  <button type="button" className="primary large" onClick={() => openExternal(wazeUrl(selected))}>Abrir no Waze</button>
                  <button type="button" className="empty-button" onClick={() => openExternal(googleMapsUrl(selected))}>Abrir no Google Maps</button>
                </div>
                <details className="map-school-details">
                  <summary>Informações da unidade</summary>
                  <p><strong>Diretor(a):</strong> {selected.diretor_geral || 'Não informado'}</p>
                  <p><strong>Telefone:</strong> {selected.telefone || 'Não informado'}</p>
                  <p><strong>Bairro:</strong> {selected.bairro || 'Não informado'}</p>
                </details>
              </aside>
            )}
          </div>
        </section>
      )}

      {tab === 'lista' && (
        <section className="page-card">
          <div className="recent-header map-list-header">
            <div>
              <p className="page-label">Unidades encontradas</p>
              <h2>{filtered.length} escola(s)</h2>
            </div>
            <button type="button" className="empty-button" onClick={() => { if (!userLocation) requestUserLocation(); else setNearestFirst(true); }}>Mostrar mais próximas</button>
          </div>

          {filtered.length === 0 ? (
            <div className="empty-state"><p>Nenhuma unidade encontrada. Tente buscar outro nome ou bairro.</p></div>
          ) : (
            <div className="map-school-list">
              {filtered.map((unit) => (
                <article className="map-school-list-card" key={unit.id}>
                  <button type="button" className="map-school-list-main" onClick={() => focusUnit(unit)}>
                    <div className="map-school-list-icon">🏫</div>
                    <div>
                      <span>{unit.designacao || 'Unidade escolar'}</span>
                      <strong>{unit.name}</strong>
                      <small>{unit.bairro || 'Bairro não informado'} · {distanceLabel(unit, userLocation)}</small>
                      <small>{unit.address || 'Endereço não informado'}</small>
                    </div>
                  </button>
                  <div className="map-school-list-actions">
                    <button type="button" className="primary" onClick={() => openExternal(wazeUrl(unit))}>Waze</button>
                    <button type="button" className="empty-button" onClick={() => openExternal(googleMapsUrl(unit))}>Google Maps</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === 'rotas' && (
        <section className="page-card">
          <div className="recent-header map-list-header">
            <div>
              <p className="page-label">Planejamento</p>
              <h2>Rotas do dia</h2>
              <p className="page-description">Monte uma sequência de escolas e abra o trajeto no Google Maps.</p>
            </div>
            <span className="status-pill">{routeStops.length} parada(s)</span>
          </div>

          <div className="map-route-controls">
            <label htmlFor="routeLimit">Quantidade de escolas</label>
            <select id="routeLimit" value={routeLimit} onChange={(event) => setRouteLimit(Number(event.target.value))}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
            <button type="button" className="primary" onClick={generateDailyRoute}>Gerar rota</button>
            {routeStops.length > 0 && <button type="button" className="empty-button" onClick={() => openExternal(googleRouteUrl(routeStops, userLocation))}>Abrir rota no Google Maps</button>}
          </div>

          {routeStops.length > 0 && (
            <>
              <div className="map-route-summary">
                <span><strong>{routeStops.length}</strong> paradas</span>
                <span><strong>{routeTotalKm.toFixed(1)} km</strong> aprox. entre pontos com coordenadas</span>
              </div>
              <div className="map-school-list">
                {routeStops.map((unit, index) => (
                  <article className="map-school-list-card" key={`route-${unit.id}`}>
                    <button type="button" className="map-route-order" onClick={() => focusUnit(unit)}>{index + 1}</button>
                    <div className="map-route-unit">
                      <strong>{stopTitle(unit)}</strong>
                      <small>{unit.address || 'Endereço não informado'} · {unit.bairro || ''}</small>
                    </div>
                    <div className="map-school-list-actions">
                      <button type="button" className="primary" onClick={() => openExternal(wazeUrl(unit))}>Waze</button>
                      <button type="button" className="empty-button" onClick={() => setRouteStops((current) => current.filter((item) => item.id !== unit.id))}>Remover</button>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}

          {routeStops.length === 0 && (
            <div className="empty-state">
              <p>Use o filtro acima para escolher um bairro ou escola e clique em Gerar rota.</p>
              <button type="button" className="empty-button" onClick={generateDailyRoute}>Gerar rota agora</button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
