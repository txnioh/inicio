import { COORDINATE_SYSTEM, FlyToInterpolator, WebMercatorViewport, type Layer, type MapViewState, type PickingInfo } from '@deck.gl/core';
import { TileLayer } from '@deck.gl/geo-layers';
import { BitmapLayer, PathLayer, PolygonLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import { SimpleMeshLayer } from '@deck.gl/mesh-layers';
import { DeckGL, type DeckGLRef } from '@deck.gl/react';
import { PathStyleExtension } from '@deck.gl/extensions';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ANOMALY_INFO, primaryAnomaly, type Twin } from '../model/analyze.ts';
import { euros } from '../model/economics.ts';
import { fromLatLon, toLatLon } from '../model/generate.ts';
import { pointInPolygon } from '../model/geometry.ts';
import type { Anomaly, Point, Tree } from '../model/types.ts';
import { describeValue, STATUS, THEME, type Theme } from '../colors.ts';
import { canopyMesh, trunkMesh } from '../map/olive-mesh.ts';
import { openTree, select, useStore } from '../store.ts';

type Props = {
  twin: Twin;
  theme: Theme;
  colours: { index: Uint8Array; palette: string[] };
  anomalies: (Anomaly[] | null)[];
  status: Uint8Array;
  lossKg: Float64Array;
  selectMode: boolean;
};

type RGBA = [number, number, number, number];
type Bounds = { minX: number; minY: number; maxX: number; maxY: number };
type Rect = { x: number; y: number; x2: number; y2: number };

/** Spain's national orthophoto (PNOA, © IGN, CC BY 4.0), 25 cm per pixel or better, and IDEE's TMS mirror of it. */
const PNOA = (x: number, y: number, z: number) => [
  `https://www.ign.es/wmts/pnoa-ma?request=GetTile&service=WMTS&version=1.0.0&layer=OI.OrthoimageCoverage&style=default&tilematrixset=GoogleMapsCompatible&tilematrix=${z}&tilerow=${y}&tilecol=${x}&format=image/jpeg`,
  `https://tms-pnoa-ma.idee.es/1.0.0/pnoa-ma/${z}/${x}/${2 ** z - 1 - y}.jpeg`,
];

/** The WMTS server fails on the odd tile, without CORS headers; the mirror usually has it. */
async function pnoaTile({ index: { x, y, z }, signal }: { index: { x: number; y: number; z: number }; signal?: AbortSignal }) {
  for (const url of PNOA(x, y, z)) {
    try {
      const response = await fetch(url, { signal });
      if (response.ok) return await createImageBitmap(await response.blob());
    } catch (error) {
      if (signal?.aborted) throw error;
    }
  }
  return null;
}

const MIN_ZOOM = 13;
const MAX_ZOOM = 21.5;
const PITCH_3D = 58;
const WHITE: RGBA = [255, 255, 255, 255];
const TRUNK: RGBA = [96, 80, 62, 255];
/** Shadows fall north-east, as on a late-morning flight; length per metre of height. */
const SUN = { x: 0.32, y: 0.22 };

const CANOPY = canopyMesh();
const TRUNK_MESH = trunkMesh();

function rgba(colour: string, alpha = 255): RGBA {
  if (colour.startsWith('#')) return [parseInt(colour.slice(1, 3), 16), parseInt(colour.slice(3, 5), 16), parseInt(colour.slice(5, 7), 16), alpha];
  const [r, g, b, a] = colour.match(/[\d.]+/g)!.map(Number);
  return [r, g, b, a === undefined ? alpha : Math.round(a * 255)];
}

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const metresPerPixel = (view: MapViewState) => (156543.03392 * Math.cos((view.latitude * Math.PI) / 180)) / 2 ** view.zoom;

export default function FarmMap({ twin, theme, colours, anomalies, status, lossKg, selectMode }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const deck = useRef<DeckGLRef>(null);
  const size = useRef({ width: 0, height: 0 });
  const [hover, setHover] = useState<{ index: number; x: number; y: number } | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const { farm } = twin;

  const campaign = useStore(s => s.campaign);
  const layer = useStore(s => s.layer);
  const tree = useStore(s => s.tree);
  const selection = useStore(s => s.selection);
  const focus = useStore(s => s.focus);
  const assumptions = useStore(s => s.assumptions);
  const basemap = useStore(s => s.basemap);
  const threeD = useStore(s => s.threeD);
  const activeTask = useStore(s => s.tasks.find(t => t.id === s.activeTask) ?? null);

  const fitBounds = (b: Bounds) => {
    const { width, height } = size.current;
    const sw = toLatLon(b.minX, b.minY), ne = toLatLon(b.maxX, b.maxY);
    const { longitude, latitude, zoom } = new WebMercatorViewport({ width: Math.max(1, width), height: Math.max(1, height) })
      .fitBounds([[sw.lon, sw.lat], [ne.lon, ne.lat]], { padding: Math.min(40, width / 8, height / 8) });
    return { longitude, latitude, zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)) };
  };
  const farmBounds = () => {
    const b = farm.bounds;
    return { minX: b.minX - 20, minY: b.minY - 20, maxX: b.maxX + 20, maxY: b.maxY + 20 };
  };

  const [view, setView] = useState<MapViewState>(() => {
    const c = toLatLon((farm.bounds.minX + farm.bounds.maxX) / 2, (farm.bounds.minY + farm.bounds.maxY) / 2);
    return { longitude: c.lon, latitude: c.lat, zoom: 15, minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM, maxPitch: 75, pitch: threeD ? PITCH_3D : 0, bearing: threeD ? -18 : 0 };
  });
  const fly = (patch: Partial<MapViewState>, duration = 600) =>
    setView(v => ({ ...v, ...patch, transitionDuration: reducedMotion() ? 0 : duration, transitionInterpolator: new FlyToInterpolator({ curve: 1.2 }) }));

  // Fit the farm once the map has a size.
  const fitted = useRef(false);
  useLayoutEffect(() => {
    const box = wrap.current!;
    const observer = new ResizeObserver(() => {
      const { width, height } = box.getBoundingClientRect();
      size.current = { width, height };
      if (!fitted.current && width > 0 && height > 0) {
        fitted.current = true;
        setView(v => ({ ...v, ...fitBounds(farmBounds()) }));
      }
    });
    observer.observe(box);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [twin]);

  // Fly to whatever the rest of the app points at.
  useEffect(() => {
    if (!focus) return;
    const target = fitBounds(focus);
    fly({ ...target, zoom: Math.min(target.zoom, 20) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  // Tilt into 3D and back.
  const firstTilt = useRef(true);
  useEffect(() => {
    if (firstTilt.current) { firstTilt.current = false; return; }
    fly(threeD ? { pitch: PITCH_3D, bearing: -18, zoom: Math.max(view.zoom, 17.2) } : { pitch: 0, bearing: 0 }, 900);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threeD]);

  // Shift + drag, or the select tool, draws a selection box instead of panning.
  const selectModeRef = useRef(selectMode);
  selectModeRef.current = selectMode;
  useEffect(() => {
    const el = wrap.current!;
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || !(selectModeRef.current || event.shiftKey)) return;
      event.stopPropagation();
      event.preventDefault();
      const box = el.getBoundingClientRect();
      const start = { x: event.clientX - box.left, y: event.clientY - box.top };
      const additive = event.shiftKey || event.metaKey || event.ctrlKey;
      let end = start;
      setRect({ ...start, x2: start.x, y2: start.y });
      setHover(null);
      const move = (m: PointerEvent) => {
        end = { x: m.clientX - box.left, y: m.clientY - box.top };
        setRect({ ...start, x2: end.x, y2: end.y });
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        setRect(null);
        if (Math.abs(end.x - start.x) < 4 || Math.abs(end.y - start.y) < 4) return;
        const viewport = deck.current?.deck?.getViewports()[0];
        if (!viewport) return;
        // Unproject the four corners to the ground: under a tilted camera the box is a trapezoid there.
        const polygon: Point[] = [[start.x, start.y], [end.x, start.y], [end.x, end.y], [start.x, end.y]].map(([x, y]) => {
          const [lon, lat] = viewport.unproject([x, y]);
          return fromLatLon(lat, lon);
        });
        const xs = polygon.map(p => p.x), ys = polygon.map(p => p.y);
        const found: number[] = [];
        twin.grid.rect(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), i => {
          if (pointInPolygon(farm.trees[i].x, farm.trees[i].y, polygon)) found.push(i);
        });
        select(found, additive ? 'add' : 'replace');
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    };
    const swallow = (event: Event) => { if (selectModeRef.current || (event as MouseEvent).shiftKey) event.stopPropagation(); };
    el.addEventListener('pointerdown', down, { capture: true });
    el.addEventListener('mousedown', swallow, { capture: true });
    el.addEventListener('touchstart', swallow, { capture: true });
    return () => {
      el.removeEventListener('pointerdown', down, { capture: true });
      el.removeEventListener('mousedown', swallow, { capture: true });
      el.removeEventListener('touchstart', swallow, { capture: true });
    };
  }, [twin, farm]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = 80 * metresPerPixel(view);
    const pan = (dx: number, dy: number) => {
      const centre = fromLatLon(view.latitude, view.longitude);
      const next = toLatLon(centre.x + dx, centre.y + dy);
      setView(v => ({ ...v, latitude: next.lat, longitude: next.lon }));
    };
    const zoom = (delta: number) => setView(v => ({ ...v, zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom + delta)) }));
    const keys: Record<string, () => void> = {
      ArrowLeft: () => pan(-step, 0),
      ArrowRight: () => pan(step, 0),
      ArrowUp: () => pan(0, step),
      ArrowDown: () => pan(0, -step),
      '+': () => zoom(0.5),
      '=': () => zoom(0.5),
      '-': () => zoom(-0.5),
      '0': () => fly(fitBounds(farmBounds())),
    };
    const action = keys[event.key];
    if (action) {
      event.preventDefault();
      action();
    }
  };

  const showNumbers = view.zoom > 18;
  const showLabels = view.zoom > 15.2;

  const layers = useMemo(() => {
    const palette = THEME[theme];
    const photo = basemap === 'foto';
    const ink: RGBA = photo ? WHITE : rgba(palette.ink);
    const local = { coordinateSystem: COORDINATE_SYSTEM.METER_OFFSETS, coordinateOrigin: [farm.origin.lon, farm.origin.lat, 0] as [number, number, number] };
    const flat = { parameters: { depthCompare: 'always' as const } };
    const fills = colours.palette.map(c => rgba(c));
    const veiled = colours.palette.map(c => rgba(c, 120));
    const snap = (t: Tree) => t.snapshots[campaign];
    const crownTop = (i: number) => (threeD ? snap(farm.trees[i]).height + 0.25 : 0);
    const list: Layer[] = [];

    if (photo) {
      list.push(new TileLayer<ImageBitmap | null>({
        id: 'pnoa',
        getTileData: pnoaTile,
        minZoom: 6,
        maxZoom: 19,
        tileSize: 256,
        maxRequests: 16,
        refinementStrategy: 'no-overlap',
        renderSubLayers: props => {
          if (!props.data) return null;
          const [[west, south], [east, north]] = (props.tile as unknown as { boundingBox: [[number, number], [number, number]] }).boundingBox;
          return new BitmapLayer({ ...props, data: undefined, image: props.data, bounds: [west, south, east, north], desaturate: 0.25, tintColor: [222, 222, 214], ...flat });
        },
      }));
    }

    list.push(new PolygonLayer<(typeof farm.plots)[number]>({
      id: 'plots',
      data: farm.plots,
      getPolygon: p => p.polygon.map(v => [v.x, v.y]),
      filled: !photo,
      getFillColor: rgba(palette.plot),
      stroked: true,
      getLineColor: photo ? [255, 255, 255, 110] : rgba(palette.plotLine),
      lineWidthUnits: 'pixels',
      getLineWidth: 1,
      ...local,
      ...flat,
    }));

    // Each olive sits on its own crown in the photo, real shadow included; the plan needs drawn ones in 3D.
    if (!photo && threeD) {
      list.push(new ScatterplotLayer<Tree>({
        id: 'shadows',
        data: farm.trees,
        getPosition: t => [t.x + snap(t).height * SUN.x, t.y + snap(t).height * SUN.y],
        getRadius: t => snap(t).canopyDiameter * 0.5,
        getFillColor: [12, 16, 6, 45],
        radiusMinPixels: 0,
        updateTriggers: { getPosition: campaign, getRadius: campaign },
        ...local,
        ...flat,
      }));
    }

    if (threeD) {
      list.push(new SimpleMeshLayer<Tree>({
        id: 'trunks',
        data: farm.trees,
        mesh: TRUNK_MESH,
        getPosition: t => [t.x, t.y, 0],
        getColor: TRUNK,
        getScale: t => [snap(t).canopyDiameter, snap(t).canopyDiameter, snap(t).height],
        getOrientation: t => [0, (t.index * 137.5) % 360, 0],
        updateTriggers: { getScale: campaign },
        ...local,
      }));
      list.push(new SimpleMeshLayer<Tree>({
        id: 'trees-3d',
        data: farm.trees,
        mesh: CANOPY,
        pickable: true,
        getPosition: t => [t.x, t.y, 0],
        getColor: t => fills[colours.index[t.index]],
        getScale: t => [snap(t).canopyDiameter, snap(t).canopyDiameter, snap(t).height],
        getOrientation: t => [0, (t.index * 137.5) % 360, 0],
        material: { ambient: 0.45, diffuse: 0.65, shininess: 8, specularColor: [40, 44, 30] },
        updateTriggers: { getColor: colours, getScale: campaign },
        ...local,
      }));
    } else {
      list.push(new ScatterplotLayer<Tree>({
        id: 'trees-2d',
        data: farm.trees,
        pickable: true,
        getPosition: t => [t.x, t.y],
        getRadius: t => snap(t).canopyDiameter / 2,
        radiusMinPixels: 0.8,
        // Over the photo, a ring and a wash of colour leave the real crown visible underneath.
        getFillColor: t => (photo ? veiled : fills)[colours.index[t.index]],
        stroked: photo,
        getLineColor: t => fills[colours.index[t.index]],
        lineWidthUnits: 'pixels',
        getLineWidth: 1.5,
        lineWidthMaxPixels: 1.5,
        updateTriggers: { getFillColor: [colours, photo], getLineColor: colours, getRadius: campaign },
        ...local,
        ...flat,
      }));
    }

    const ring = (id: string, indices: number[], colour: RGBA, width: number, extra: number) => new ScatterplotLayer<number>({
      id,
      data: indices,
      getPosition: i => [farm.trees[i].x, farm.trees[i].y, crownTop(i)],
      getRadius: i => snap(farm.trees[i]).canopyDiameter / 2 + extra,
      radiusMinPixels: 2.5,
      filled: false,
      stroked: true,
      getLineColor: colour,
      lineWidthUnits: 'pixels',
      getLineWidth: width,
      updateTriggers: { getPosition: [campaign, threeD], getRadius: campaign },
      ...local,
      ...(threeD ? {} : flat),
    });

    if (selection.length) list.push(ring('selection', selection, [ink[0], ink[1], ink[2], 230], 1.5, 0.5));

    if (activeTask) {
      const route = rgba(palette.route);
      const stops = activeTask.route.map(i => [farm.trees[i].x, farm.trees[i].y]);
      list.push(new PathLayer<number[][]>({
        id: 'route',
        data: [[[farm.gate.x, farm.gate.y], ...stops]],
        getPath: d => d as [number, number][],
        getColor: route,
        widthUnits: 'pixels',
        getWidth: 2,
        jointRounded: true,
        // @ts-expect-error props added by PathStyleExtension
        getDashArray: [5, 4],
        dashJustified: true,
        extensions: [new PathStyleExtension({ dash: true })],
        ...local,
        ...flat,
      }));
      const numbers = showNumbers && activeTask.route.length <= 400;
      list.push(new ScatterplotLayer<number>({
        id: 'route-stops',
        data: [-1, ...activeTask.route],
        getPosition: i => (i < 0 ? [farm.gate.x, farm.gate.y] : [farm.trees[i].x, farm.trees[i].y]),
        radiusUnits: 'pixels',
        getRadius: i => (i < 0 ? 5 : numbers ? 8 : 3),
        getFillColor: i => {
          const outcome = i < 0 ? undefined : activeTask.results[i];
          return outcome === 'confirmado' ? rgba(STATUS[theme][2]) : outcome === 'falso' ? rgba(STATUS[theme][0]) : route;
        },
        updateTriggers: { getRadius: numbers, getFillColor: [activeTask.results, theme] },
        ...local,
        ...flat,
      }));
      if (numbers) {
        list.push(new TextLayer<number>({
          id: 'route-numbers',
          data: activeTask.route.map((_, k) => k),
          getPosition: k => [farm.trees[activeTask.route[k]].x, farm.trees[activeTask.route[k]].y],
          getText: k => String(k + 1),
          getSize: 9,
          getColor: WHITE,
          fontFamily: "'Geist Variable', system-ui, sans-serif",
          fontWeight: 600,
          characterSet: '0123456789',
          ...local,
          ...flat,
        }));
      }
    }

    list.push(new TextLayer<(typeof farm.plots)[number]>({
      id: 'plot-labels',
      data: farm.plots,
      visible: showLabels,
      getPosition: p => [p.centroid.x, p.centroid.y],
      getText: p => `Parcela ${p.id}`,
      getSize: 12,
      getColor: photo ? WHITE : rgba(palette.label),
      fontFamily: "'Geist Variable', system-ui, sans-serif",
      fontWeight: 600,
      fontSettings: { sdf: true },
      outlineWidth: 4,
      outlineColor: photo ? [0, 0, 0, 150] : rgba(palette.ground),
      ...local,
      ...flat,
    }));

    if (hover) list.push(ring('hover', [hover.index], ink, 1.5, 1));
    if (tree !== null) {
      list.push(ring('open-halo', [tree], photo ? [0, 0, 0, 160] : rgba(palette.ground), 5, 1.5));
      list.push(ring('open', [tree], ink, 2, 1.5));
    }
    return list;
  }, [twin, farm, theme, basemap, threeD, colours, campaign, selection, activeTask, hover, tree, showNumbers, showLabels]);

  const onHover = (info: PickingInfo) => {
    if (rect) return;
    const index = info.layer?.id.startsWith('trees') && info.index >= 0 ? info.index : -1;
    setHover(current => (index < 0 ? null : current?.index === index ? { ...current, x: info.x, y: info.y } : { index, x: info.x, y: info.y }));
  };

  const onClick = (info: PickingInfo, event: { srcEvent: Event }) => {
    const index = info.layer?.id.startsWith('trees') ? info.index : -1;
    const source = event.srcEvent as MouseEvent;
    if ((source.metaKey || source.ctrlKey) && index >= 0) select([index], 'toggle');
    else openTree(index >= 0 ? index : null);
  };

  const hovered = hover ? farm.trees[hover.index] : null;
  const hoveredAnomaly = hover ? primaryAnomaly(anomalies[hover.index]) : null;
  const hoveredValue = hover ? describeValue(layer, twin, campaign, hover.index, euros(lossKg[hover.index], assumptions)) : null;

  return (
    <div
      ref={wrap}
      className={`farm-map${selectMode ? ' is-selecting' : ''}`}
      style={{ background: basemap === 'foto' ? '#22251c' : THEME[theme].ground }}
      tabIndex={0}
      role="application"
      aria-label="Mapa de la finca. Arrastra para moverte, rueda o pellizco para acercar, flechas y + − desde el teclado, 0 para ver toda la finca. En 3D, clic derecho y arrastrar para girar."
      onKeyDown={onKeyDown}
      onPointerLeave={() => setHover(null)}
    >
      <DeckGL
        ref={deck}
        viewState={view}
        onViewStateChange={({ viewState }) => setView(viewState as MapViewState)}
        controller={{ dragRotate: threeD, touchRotate: threeD, keyboard: false, inertia: 250 }}
        layers={layers}
        pickingRadius={6}
        onHover={onHover}
        onClick={onClick}
        getCursor={({ isDragging, isHovering }) => (selectMode ? 'crosshair' : isDragging ? 'grabbing' : isHovering ? 'pointer' : 'grab')}
      />
      {rect && (
        <div
          className="pointer-events-none absolute border border-route bg-route/10"
          style={{ left: Math.min(rect.x, rect.x2), top: Math.min(rect.y, rect.y2), width: Math.abs(rect.x2 - rect.x), height: Math.abs(rect.y2 - rect.y) }}
        />
      )}
      {hovered && hover && (
        <div className="map-tooltip" style={{ transform: `translate(${Math.min(hover.x + 14, size.current.width - 230)}px, ${hover.y + 14}px)` }} role="status">
          <strong>Olivo {hovered.id}</strong>
          <span>{hovered.variety} · Parcela {farm.plots[hovered.plot].id}</span>
          {hoveredValue && <span>{hoveredValue}</span>}
          {hoveredAnomaly && <span className={`tooltip-flag is-${status[hover.index]}`}>{ANOMALY_INFO[hoveredAnomaly.type].label}</span>}
        </div>
      )}
      {basemap === 'foto' && (
        <a
          href="https://www.ign.es"
          target="_blank"
          rel="noreferrer"
          className="absolute right-2 bottom-[4.5rem] text-[10px] text-white/70 [text-shadow:0_1px_2px_rgba(0,0,0,.6)] hover:text-white max-[820px]:bottom-[8rem]"
        >
          PNOA © IGN
        </a>
      )}
    </div>
  );
}
