// utils.js — Shared utilities for LAST SIGNAL: DEAD ZONE

export function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function dist(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

export function distSq(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return dx * dx + dy * dy;
}

export function angle(x1, y1, x2, y2) {
  return Math.atan2(y2 - y1, x2 - x1);
}

export function normalize(x, y) {
  const len = Math.sqrt(x * x + y * y);
  if (len === 0) return { x: 0, y: 0 };
  return { x: x / len, y: y / len };
}

export function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

export function randomInt(min, max) {
  return Math.floor(randomRange(min, max + 1));
}

export function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function weightedRandom(weights) {
  const total = weights.reduce((s, w) => s + w.weight, 0);
  let r = Math.random() * total;
  for (const item of weights) {
    r -= item.weight;
    if (r <= 0) return item.value;
  }
  return weights[weights.length - 1].value;
}

export function rectContains(rx, ry, rw, rh, px, py) {
  return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
}

export function rectIntersects(r1x, r1y, r1w, r1h, r2x, r2y, r2w, r2h) {
  return r1x < r2x + r2w && r1x + r1w > r2x && r1y < r2y + r2h && r1y + r1h > r2y;
}

export function circleIntersects(x1, y1, r1, x2, y2, r2) {
  const d = dist(x1, y1, x2, y2);
  return d < r1 + r2;
}

export function pointInCircle(px, py, cx, cy, r) {
  return distSq(px, py, cx, cy) <= r * r;
}

export function lineIntersectsRect(x1, y1, x2, y2, rx, ry, rw, rh) {
  // Check if a line segment intersects a rectangle
  const left = rx, right = rx + rw, top = ry, bottom = ry + rh;
  // Check if either endpoint is inside
  if (rectContains(rx, ry, rw, rh, x1, y1) || rectContains(rx, ry, rw, rh, x2, y2)) return true;
  // Check line against each edge
  if (lineIntersectsLine(x1, y1, x2, y2, left, top, right, top)) return true;
  if (lineIntersectsLine(x1, y1, x2, y2, right, top, right, bottom)) return true;
  if (lineIntersectsLine(x1, y1, x2, y2, left, bottom, right, bottom)) return true;
  if (lineIntersectsLine(x1, y1, x2, y2, left, top, left, bottom)) return true;
  return false;
}

function lineIntersectsLine(x1, y1, x2, y2, x3, y3, x4, y4) {
  const d = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3);
  if (d === 0) return false;
  const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / d;
  const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / d;
  return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1;
}

export function generateId() {
  return '_' + Math.random().toString(36).substr(2, 9);
}

export function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// Simple seeded random
export class SeededRandom {
  constructor(seed) {
    this.seed = seed;
  }
  next() {
    this.seed = (this.seed * 16807 + 0) % 2147483647;
    return (this.seed - 1) / 2147483646;
  }
  nextRange(min, max) {
    return min + this.next() * (max - min);
  }
  nextInt(min, max) {
    return Math.floor(this.nextRange(min, max + 1));
  }
}