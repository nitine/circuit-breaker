import type { AgentName } from "~/shared/types";

/** Pixel coordinates in public/room/room.png (1600x900), measured from the generated render. */
export const SCENE = {
  w: 1600, h: 900,
  spriteHeight: 130,
  objects: {
    board: { x: 415, y: 94, w: 278, h: 199 },
    gauge: { x: 720, y: 63, w: 132, h: 132 },
    lever: { x: 736, y: 209, w: 91, h: 148 },
    crt: { x: 915, y: 141, w: 113, h: 99 },
    cabinet: { x: 1063, y: 152, w: 90, h: 311 },
    booth: { x: 1151, y: 187, w: 122, h: 293 },
    listenerDesk: { x: 108, y: 352, w: 318, h: 199 },
    printer: { x: 1273, y: 387, w: 148, h: 105 },
    desk: { x: 824, y: 656, w: 273, h: 199 },
    phone: { x: 889, y: 724, w: 64, h: 43 },
    plant: { x: 1085, y: 574, w: 97, h: 199 },
  },
  /** Feet positions when idle. */
  home: { listener: { x: 345, y: 632 }, analyst: { x: 612, y: 445 }, archivist: { x: 1062, y: 545 }, guardian: { x: 805, y: 468 }, reporter: { x: 1200, y: 612 } } as Record<AgentName, { x: number; y: number }>,
  /** Feet positions when using an object. */
  spots: { board: { x: 556, y: 395 }, cabinet: { x: 1100, y: 500 }, lever: { x: 787, y: 392 }, booth: { x: 1206, y: 520 }, printer: { x: 1245, y: 562 }, desk: { x: 812, y: 702 }, listenerDesk: { x: 345, y: 632 } },
  /** Walkable floor for attract-mode wandering. */
  floor: { x0: 380, x1: 1040, y0: 420, y1: 640 },
  /** Perspective: sprites scale with depth (feet y). */
  depth: (y: number) => 0.82 + 0.28 * Math.max(0, Math.min(1, (y - 440) / 380)),
};
export type ObjKey = keyof typeof SCENE.objects;
