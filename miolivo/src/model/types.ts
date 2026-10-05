export const CAMPAIGNS = [2024, 2025, 2026] as const;
export type CampaignIndex = 0 | 1 | 2;
/** 2024 and 2025 have a weighed harvest; 2026 is still on the tree. */
export const FORECAST: CampaignIndex = 2;

export type Point = { x: number; y: number };
export type Variety = 'Picual' | 'Hojiblanca' | 'Arbequina';
export type Irrigation = 'secano' | 'goteo';
export type System = 'tradicional' | 'intensivo';

export type Treatment = { date: string; label: string };

export type Plot = {
  id: string;
  /** Recinto SIGPAC: provincia:municipio:agregado:zona:polígono:parcela. */
  sigpac: string;
  polygon: Point[];
  centroid: Point;
  hectares: number;
  system: System;
  irrigation: Irrigation;
  variety: Variety;
  spacing: [number, number];
  pruneYears: number[];
  pruneMonth: string;
  treatments: Treatment[];
  treeCount: number;
};

/** What a flight, a satellite pass and the cooperative's scale say about one tree in one campaign. */
export type Snapshot = {
  canopyDiameter: number; // m
  height: number; // m
  volume: number; // m³, ellipsoid over the crown
  vigor: number; // 0–100, from multispectral
  waterStress: number; // CWSI 0–1, from thermal
  /** Weighed at the mill for past campaigns; null while the harvest is pending. */
  harvestKg: number | null;
};

/** Hidden cause planted by the simulation. The app never reads it; tests and the "field visit" simulation do. */
export type Cause = 'riego' | 'nitrogeno' | 'poda' | 'verticilosis';

export type Tree = {
  index: number;
  id: string;
  plot: number;
  x: number; // m east of the farm origin
  y: number; // m north of the farm origin
  lat: number;
  lon: number;
  variety: Variety;
  plantedYear: number;
  irrigation: Irrigation;
  /** Winters this tree was pruned, oldest first. */
  pruneYears: number[];
  snapshots: [Snapshot, Snapshot, Snapshot];
  cause: Cause | null;
};

export type Farm = {
  name: string;
  municipality: string;
  origin: { lat: number; lon: number };
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  gate: Point;
  plots: Plot[];
  trees: Tree[];
};

export type AnomalyType = 'estres' | 'vigor' | 'copa' | 'poda';
export type Severity = 1 | 2; // 1 revisar (amarillo), 2 actuar (rojo)
export type Status = 0 | 1 | 2; // verde, amarillo, rojo

export type Anomaly = { type: AnomalyType; severity: Severity; evidence: string };

export type TaskType = 'inspeccion' | 'poda' | 'riego' | 'tratamiento';
export type Outcome = 'confirmado' | 'falso';

export type Task = {
  id: string;
  type: TaskType;
  title: string;
  createdAt: string;
  campaign: CampaignIndex;
  /** Tree indices in visiting order. */
  route: number[];
  distanceM: number;
  hours: number;
  done: boolean;
  completedAt?: string;
  results: Record<number, Outcome>;
  /** The diagnosis being checked, if the task came from one. */
  anomaly?: AnomalyType;
};
