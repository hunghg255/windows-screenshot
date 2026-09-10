import type { Point } from '../../shared/contracts';

export type QuarterTurns = 0 | 1 | 2 | 3;
type Size = { width: number; height: number };
export function rotatedSize(size: Size, turns: QuarterTurns): Size {
  return turns % 2 ? { width: size.height, height: size.width } : { width: size.width, height: size.height };
}
export function scenePoint(p: Point, size: Size, turns: QuarterTurns): Point {
  switch (turns) {
    case 1: return { x: size.height - p.y, y: p.x };
    case 2: return { x: size.width - p.x, y: size.height - p.y };
    case 3: return { x: p.y, y: size.width - p.x };
    default: return p;
  }
}
export function sourcePoint(p: Point, size: Size, turns: QuarterTurns): Point {
  return scenePoint(p, rotatedSize(size, turns), ((4 - turns) % 4) as QuarterTurns);
}
export function sourceVector(p: Point, turns: QuarterTurns): Point {
  return sourcePoint(p, { width: 0, height: 0 }, turns);
}
export function sceneMatrix(size: Size, turns: QuarterTurns): [number, number, number, number, number, number] {
  switch (turns) {
    case 1: return [0, 1, -1, 0, size.height, 0];
    case 2: return [-1, 0, 0, -1, size.width, size.height];
    case 3: return [0, -1, 1, 0, 0, size.width];
    default: return [1, 0, 0, 1, 0, 0];
  }
}
