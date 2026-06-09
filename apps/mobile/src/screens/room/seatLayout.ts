import { Dimensions } from "react-native";
import { frameOuterSizeFromScale } from "@components/AvatarFrameRing";

const { width: DEFAULT_SCREEN_WIDTH, height: DEFAULT_SCREEN_HEIGHT } =
  Dimensions.get("window");

/**
 * Frame ring scale for seats. Slightly below profile avatars so the circle can
 * grow while the decorative ring still fits the row width budget.
 */
export const SEAT_AVATAR_FRAME_SCALE = 1.3;

export const SEAT_WRAP_PAD = 0;
export const SEAT_GAP_DEFAULT = 11;
export const SEAT_GAP_DENSE = 8;
/** Legacy export — pyramid rows use row gap only for horizontal slot math. */
export const SEAT_FRAME_BLEED = 6;
export const SEAT_FRAME_BLEED_FLAT = 3;
/** Centered pyramid layouts (5 / 10 mic). */
export const SEAT_PAD = 8;
/** Flat full-width grids (15+) — `space-between` distributes extra width. */
export const SEAT_PAD_FLAT = 6;
/** Empty-seat chair graphic vs circle diameter. */
export const SEAT_ICON_SCALE = 0.78;

export const SEAT_ITEM_EXTRA_WIDTH = 2;
export const SEAT_LABEL_HEIGHT = 22;

const FLAT_GRID_COLS = 5;
const FLAT_6_COLS = 6;

const MIC_30_ROWS: number[][] = [
  [1, 2, 3, 4, 5, 6],
  [7, 8, 9, 10, 11, 12],
  [13, 14, 15, 16, 17, 18],
  [19, 20, 21, 22, 23, 24],
  [25, 26, 27, 28, 29, 30],
];

/** Visual layout family per reference screenshots. */
export type SeatLayoutMode = "pyramid" | "flat5" | "flat6";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function getSeatLayoutMode(micConfig: number): SeatLayoutMode {
  if (micConfig <= 10) return "pyramid";
  if (micConfig >= 30) return "flat6";
  return "flat5";
}

export function isFlatMicGrid(micConfig: number): boolean {
  return getSeatLayoutMode(micConfig) !== "pyramid";
}

export function getSeatHorizontalPad(micConfig: number): number {
  return isFlatMicGrid(micConfig) ? SEAT_PAD_FLAT : SEAT_PAD;
}

/** Flat grid: `seatCount` positions in rows of `cols`. */
function buildFlatGridRows(seatCount: number, cols: number): number[][] {
  const positions = Array.from({ length: seatCount }, (_, i) => i + 1);
  const rows: number[][] = [];
  for (let i = 0; i < positions.length; i += cols) {
    rows.push(positions.slice(i, i + cols));
  }
  return rows;
}

export function computeSeatTopOffset(screenHeight: number): number {
  return clamp(Math.round(screenHeight * 0.09), 110, 130);
}

/** Vertical gap between rows — denser as row count grows (reference). */
export function getSeatRowGap(micConfig: number): number {
  if (micConfig <= 10) return 8;
  if (micConfig >= 20) return SEAT_GAP_DENSE;
  return SEAT_GAP_DEFAULT;
}

/** Seat-block height budget vs screen — scales with row count in reference. */
function getSeatAreaHeightRatio(micConfig: number): number {
  if (micConfig <= 5) return 0.42;
  if (micConfig <= 10) return 0.45;
  if (micConfig <= 15) return 0.48;
  if (micConfig <= 20) return 0.52;
  if (micConfig <= 25) return 0.54;
  return 0.56;
}

/** Target seat circle diameter (px) from product spec — never exceeds width fit. */
function getDesignSeatDiameter(micConfig: number): number {
  if (micConfig <= 5) return 72;
  if (micConfig <= 10) return 64;
  if (micConfig <= 15) return 56;
  if (micConfig <= 20) return 52;
  if (micConfig <= 25) return 48;
  return 44;
}

/** Column count for width-based seat sizing (widest row in layout). */
function getSizingColsForMic(micConfig: number): number {
  const mode = getSeatLayoutMode(micConfig);
  if (mode === "pyramid") return 4;
  if (mode === "flat6") return FLAT_6_COLS;
  return FLAT_GRID_COLS;
}

/** 10-mic keeps 5-mic circle size (reference); flat grids use true row count. */
function getHeightBudgetRowCount(micConfig: number, actualRowCount: number): number {
  if (micConfig === 10) return 2;
  return actualRowCount;
}

function getMinMaxForMic(micConfig: number): { min: number; max: number } {
  const design = getDesignSeatDiameter(micConfig);
  if (micConfig <= 10) return { min: design - 4, max: design + 12 };
  if (micConfig <= 20) return { min: design - 4, max: design + 10 };
  return { min: design - 4, max: design + 8 };
}

export type RoomSeatRowsLayout = {
  showDedicatedHostRow: boolean;
  rows: number[][];
  mode: SeatLayoutMode;
};

/**
 * Seat rows per reference layouts:
 * - 5: 1 + row of 4 (centered pyramid)
 * - 10: 2 + 4 + 4 (centered pyramid)
 * - 15: 5×3 flat
 * - 20: 5×4 flat
 * - 25: 5×5 flat
 * - 30: 6×5 flat
 */
export function getRoomSeatRows(
  micConfig: number,
  _colsFromLayout?: number,
): RoomSeatRowsLayout {
  if (micConfig === 5) {
    return {
      mode: "pyramid",
      showDedicatedHostRow: false,
      rows: [[1], [2, 3, 4, 5]],
    };
  }
  if (micConfig === 10) {
    return {
      mode: "pyramid",
      showDedicatedHostRow: false,
      rows: [
        [1, 2],
        [3, 4, 5, 6],
        [7, 8, 9, 10],
      ],
    };
  }
  if (micConfig === 15) {
    return {
      mode: "flat5",
      showDedicatedHostRow: false,
      rows: buildFlatGridRows(15, FLAT_GRID_COLS),
    };
  }
  if (micConfig === 20) {
    return {
      mode: "flat5",
      showDedicatedHostRow: false,
      rows: buildFlatGridRows(20, FLAT_GRID_COLS),
    };
  }
  if (micConfig === 25) {
    return {
      mode: "flat5",
      showDedicatedHostRow: false,
      rows: buildFlatGridRows(25, FLAT_GRID_COLS),
    };
  }
  if (micConfig >= 30) {
    return {
      mode: "flat6",
      showDedicatedHostRow: false,
      rows: MIC_30_ROWS,
    };
  }
  return {
    mode: "flat5",
    showDedicatedHostRow: false,
    rows: buildFlatGridRows(micConfig, FLAT_GRID_COLS),
  };
}

export function countSeatRows(seatRows: RoomSeatRowsLayout): number {
  return seatRows.rows.length + (seatRows.showDedicatedHostRow ? 1 : 0);
}

/** Full slot size (circle + equipped frame ring) for a given seat circle diameter. */
export function getSeatCellExtent(seatDiameter: number): number {
  const avatarInner = seatDiameter - 4;
  const frameOuter = frameOuterSizeFromScale(
    avatarInner,
    SEAT_AVATAR_FRAME_SCALE,
  );
  return Math.max(seatDiameter, frameOuter);
}

/** Largest seat circle that fits in a column slot of `slotWidth` px. */
function maxSeatDiameterForSlotWidth(slotWidth: number): number {
  const maxCell = Math.floor(slotWidth - SEAT_WRAP_PAD - SEAT_ITEM_EXTRA_WIDTH);
  if (maxCell <= 0) return 0;
  let s = maxCell;
  while (s > 0 && getSeatCellExtent(s) > maxCell) {
    s -= 1;
  }
  return s;
}

export type SeatLayoutResult = {
  cols: number;
  seatSize: number;
  rowCount: number;
  rowGap: number;
  mode: SeatLayoutMode;
};

export function computeSeatLayout(
  micConfig: number,
  containerWidth: number,
  screenHeight: number = DEFAULT_SCREEN_HEIGHT,
): SeatLayoutResult {
  const mode = getSeatLayoutMode(micConfig);
  const gap = getSeatRowGap(micConfig);
  const sizingCols = getSizingColsForMic(micConfig);
  const seatRows = getRoomSeatRows(micConfig, sizingCols);
  const rowCount = countSeatRows(seatRows);
  const heightRowCount = getHeightBudgetRowCount(micConfig, rowCount);
  const { min, max } = getMinMaxForMic(micConfig);

  const width =
    containerWidth > 0 ? containerWidth : DEFAULT_SCREEN_WIDTH;
  const horizontalPad = getSeatHorizontalPad(micConfig);
  const available = width - horizontalPad * 2;

  const sizeForCols = (columnCount: number) => {
    // Flat rows use `space-between`; pyramid rows use flex `gap` between items.
    // Cell extent already includes the frame ring — do not subtract frame bleed again.
    const slotWidth = isFlatMicGrid(micConfig)
      ? available / columnCount
      : (available - (columnCount - 1) * gap) / columnCount;
    return maxSeatDiameterForSlotWidth(slotWidth);
  };

  const sizeFromWidth = sizeForCols(sizingCols);

  const budget = screenHeight * getSeatAreaHeightRatio(micConfig);
  const gapsBetweenRows = Math.max(0, heightRowCount - 1) * gap;
  const maxCellFromHeight = Math.floor(
    (budget - gapsBetweenRows) / heightRowCount - SEAT_LABEL_HEIGHT,
  );
  let sizeFromHeight = maxCellFromHeight;
  while (
    sizeFromHeight > 0 &&
    getSeatCellExtent(sizeFromHeight) > maxCellFromHeight
  ) {
    sizeFromHeight -= 1;
  }

  // Width is a hard ceiling: the row physically cannot be wider than `sizeFromWidth`
  // (which already accounts for the frame ring via getSeatCellExtent). The `min` clamp
  // is only a readability floor — it must never push the seat past what the row width
  // allows, or the outer seats overflow off-screen (esp. once the 1.44 frame ring
  // inflates each cell). So cap the clamped size by the width budget.
  const natural = Math.min(sizeFromWidth, sizeFromHeight);
  const design = getDesignSeatDiameter(micConfig);
  const seatSize = Math.min(
    clamp(Math.max(natural, Math.min(design, sizeFromWidth)), min, max),
    sizeFromWidth,
  );

  return { cols: sizingCols, seatSize, rowCount, rowGap: gap, mode };
}

/** Geometry floor for chat top — mirrors seat grid flex layout. */
export function estimateSeatBlockBottomPx(
  seatSize: number,
  micConfig: number,
  seatRows: RoomSeatRowsLayout,
  insetsTop: number,
  screenHeight: number = DEFAULT_SCREEN_HEIGHT,
): number {
  const gap = getSeatRowGap(micConfig);
  const rowCount = countSeatRows(seatRows);
  const rowContentH = getSeatCellExtent(seatSize) + SEAT_LABEL_HEIGHT;
  const bodyHeight =
    rowCount * rowContentH + Math.max(0, rowCount - 1) * gap;
  return insetsTop + computeSeatTopOffset(screenHeight) + bodyHeight;
}
