export type FloorId = "planta-baja" | "piso-1" | "piso-2";

export interface FloorPlan {
  id: FloorId;
  label: string;
  /** Zone ids that belong to this floor, in the order they should render. */
  zoneIds: string[];
}

export const FLOOR_PLANS: FloorPlan[] = [
  {
    id: "planta-baja",
    label: "Planta baja",
    zoneIds: [
      "patio-trasero",
      "bano",
      "escaleras-pb",
      "estudio",
      "garaje",
      "cocina",
      "comedor",
      "sala",
      "jardin",
    ],
  },
  {
    id: "piso-1",
    label: "1er piso",
    zoneIds: [
      "bano-p1",
      "escaleras-p1",
      "librero",
      "cuarto-papas",
      "pasillo",
      "escaleras-p1-servicio",
      "cuarto-carlitos",
      "cuarto-paulina",
      "terraza",
    ],
  },
  {
    id: "piso-2",
    label: "2do piso",
    zoneIds: ["cuarto-servicio", "bano-p2", "azotea", "escaleras-p2"],
  },
];

export const DEFAULT_FLOOR_ID: FloorId = "planta-baja";
