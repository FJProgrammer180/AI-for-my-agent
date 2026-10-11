// Game.js — Main game engine for LAST SIGNAL: DEAD ZONE
// This file contains the core game loop, all systems, and rendering.

import { clamp, lerp, dist, distSq, angle, normalize, randomRange, randomInt, randomChoice, weightedRandom, rectContains, rectIntersects, circleIntersects, pointInCircle, generateId, formatTime, SeededRandom } from './utils.js';
import { WEAPONS, WEAPON_TYPES, AMMO_TYPES, RARITY, RARITY_COLORS, RARITY_WEIGHTS, getRandomWeapon } from '../data/weapons.js';
import { ROLES, BASE_STATS } from '../data/classes.js';
import { ZOMBIE_TYPES, ZOMBIE_STATES, BOSS_TYPES } from '../data/zombies.js';

// ============================================================
// CONSTANTS
// ============================================================
const TILE_SIZE = 40;
const WORLD_TILES_X = 150;
const WORLD_TILES_Y = 150;
const WORLD_WIDTH = WORLD_TILES_X * TILE_SIZE;
const WORLD_HEIGHT = WORLD_TILES_Y * TILE_SIZE;

const TILE = {
  GRASS: 0,
  ROAD: 1,
  SIDEWALK: 2,
  WALL: 3,
  FLOOR: 4,
  DOOR: 5,
  WINDOW: 6,
  LOOT_FLOOR: 7,
  SAFEHOUSE: 8,
};

const DAY_DURATION = 600; // seconds for full day cycle (10 minutes)
const NIGHT_START = 0.65; // 65% of cycle
const NIGHT_END = 0.15;   // 15% = dawn

// ============================================================
// AUDIO SYSTEM (Web Audio API)
// ============================================================
class AudioSystem {
  constructor() {
    this.ctx = null;
    this.masterVolume = 0.5;
    this.sfxVolume = 0.7;
    this.musicVolume = 0.3;
    this.initialized = false;
  }

  init() {
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.masterVolume;
      this.masterGain.connect(this.ctx.destination);
      this.initialized = true;
    } catch (e) {
      console.warn('Web Audio not available');
    }
  }

  setVolume(type, value) {
    if (type === 'master') this.masterVolume = value;
    if (type === 'sfx') this.sfxVolume = value;
    if (type === 'music') this.musicVolume = value;
    if (this.masterGain) this.masterGain.gain.value = this.masterVolume;
  }

  playSound(type, volume = 1.0) {
    if (!this.initialized || !this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.masterGain);

      const now = this.ctx.currentTime;
      switch (type) {
        case 'shoot':
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(200, now);
          osc.frequency.exponentialRampToValueAtTime(50, now + 0.1);
          gain.gain.setValueAtTime(0.3 * volume * this.sfxVolume, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
          osc.start(now);
          osc.stop(now + 0.1);
          break;
        case 'shotgun':
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(150, now);
          osc.frequency.exponentialRampToValueAtTime(30, now + 0.15);
          gain.gain.setValueAtTime(0.5 * volume * this.sfxVolume, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
          osc.start(now);
          osc.stop(now + 0.15);
          break;
        case 'melee':
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(300, now);
          osc.frequency.exponentialRampToValueAtTime(100, now + 0.08);
          gain.gain.setValueAtTime(0.2 * volume * this.sfxVolume, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
          osc.start(now);
          osc.stop(now + 0.08);
          break;
        case 'reload':
          osc.type = 'square';
          osc.frequency.setValueAtTime(400, now);
          osc.frequency.setValueAtTime(500, now + 0.1);
          gain.gain.setValueAtTime(0.15 * volume * this.sfxVolume, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
          osc.start(now);
          osc.stop(now + 0.2);
          break;
        case 'pickup':
          osc.type = 'sine';
          osc.frequency.setValueAtTime(500, now);
          osc.frequency.exponentialRampToValueAtTime(800, now + 0.1);
          gain.gain.setValueAtTime(0.2 * volume * this.sfxVolume, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
          osc.start(now);
          osc.stop(now + 0.15);
          break;
        case 'hit':
          osc.type = 'square';
          osc.frequency.setValueAtTime(200, now);
          osc.frequency.exponentialRampToValueAtTime(80, now + 0.08);
          gain.gain.setValueAtTime(0.25 * volume * this.sfxVolume, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
          osc.start(now);
          osc.stop(now + 0.08);
          break;
        case 'explosion':
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(100, now);
          osc.frequency.exponentialRampToValueAtTime(20, now + 0.3);
          gain.gain.setValueAtTime(0.5 * volume * this.sfxVolume, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
          osc.start(now);
          osc.stop(now + 0.3);
          break;
        case 'death':
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(300, now);
          osc.frequency.exponentialRampToValueAtTime(50, now + 0.5);
          gain.gain.setValueAtTime(0.3 * volume * this.sfxVolume, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
          osc.start(now);
          osc.stop(now + 0.5);
          break;
        case 'levelup':
          osc.type = 'sine';
          osc.frequency.setValueAtTime(400, now);
          osc.frequency.setValueAtTime(500, now + 0.1);
          osc.frequency.setValueAtTime(600, now + 0.2);
          osc.frequency.setValueAtTime(800, now + 0.3);
          gain.gain.setValueAtTime(0.3 * volume * this.sfxVolume, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
          osc.start(now);
          osc.stop(now + 0.4);
          break;
        case 'skill':
          osc.type = 'sine';
          osc.frequency.setValueAtTime(600, now);
          osc.frequency.exponentialRampToValueAtTime(1200, now + 0.2);
          gain.gain.setValueAtTime(0.25 * volume * this.sfxVolume, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
          osc.start(now);
          osc.stop(now + 0.3);
          break;
        case 'craft':
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(300, now);
          osc.frequency.setValueAtTime(400, now + 0.1);
          osc.frequency.setValueAtTime(500, now + 0.2);
          gain.gain.setValueAtTime(0.2 * volume * this.sfxVolume, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
          osc.start(now);
          osc.stop(now + 0.3);
          break;
        case 'airdrop':
          osc.type = 'sine';
          osc.frequency.setValueAtTime(800, now);
          osc.frequency.setValueAtTime(600, now + 0.2);
          osc.frequency.setValueAtTime(800, now + 0.4);
          gain.gain.setValueAtTime(0.3 * volume * this.sfxVolume, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
          osc.start(now);
          osc.stop(now + 0.6);
          break;
      }
    } catch (e) { /* ignore audio errors */ }
  }
}

// ============================================================
// INPUT MANAGER
// ============================================================
class InputManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = {};
    this.mouse = { x: 0, y: 0, worldX: 0, worldY: 0, left: false, right: false, leftDown: false, rightDown: false, leftUp: false, rightUp: false };
    this.prevMouse = { left: false, right: false };
    this.uiConsume = false; // set true to prevent game input for one frame

    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      // Prevent default for game keys
      if (['Tab', 'KeyM', 'KeyE', 'KeyQ', 'Space'].includes(e.code) || 
          (e.code === 'Escape')) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });
    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - rect.left;
      this.mouse.y = e.clientY - rect.top;
    });
    canvas.addEventListener('mousedown', (e) => {
      e.preventDefault();
      if (e.button === 0) this.mouse.left = true;
      if (e.button === 2) this.mouse.right = true;
    });
    canvas.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  update(camera) {
    this.mouse.leftDown = this.mouse.left && !this.prevMouse.left;
    this.mouse.leftUp = !this.mouse.left && this.prevMouse.left;
    this.mouse.rightDown = this.mouse.right && !this.prevMouse.right;
    this.mouse.rightUp = !this.mouse.right && this.prevMouse.right;
    this.prevMouse.left = this.mouse.left;
    this.prevMouse.right = this.mouse.right;

    // Convert mouse to world coordinates
    this.mouse.worldX = this.mouse.x + camera.x - camera.viewW / 2;
    this.mouse.worldY = this.mouse.y + camera.y - camera.viewH / 2;
  }

  consumeUI() {
    this.uiConsume = true;
  }

  isDown(code) {
    return !!this.keys[code];
  }

  justPressed(code) {
    // For single-press actions, we track via keydown events
    return !!this.keys[code + '_just'];
  }
}

// ============================================================
// CAMERA
// ============================================================
class Camera {
  constructor(w, h) {
    this.x = 0;
    this.y = 0;
    this.viewW = w;
    this.viewH = h;
    this.smoothing = 8;
    this.shake = 0;
    this.shakeDecay = 5;
  }

  follow(target, dt) {
    this.x = lerp(this.x, target.x, this.smoothing * dt);
    this.y = lerp(this.y, target.y, this.smoothing * dt);
    // Clamp to world bounds
    this.x = clamp(this.x, this.viewW / 2, WORLD_WIDTH - this.viewW / 2);
    this.y = clamp(this.y, this.viewH / 2, WORLD_HEIGHT - this.viewH / 2);
  }

  addShake(amount) {
    this.shake = Math.min(this.shake + amount, 15);
  }

  update(dt) {
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - this.shakeDecay * dt);
    }
  }

  getOffset() {
    let ox = this.x - this.viewW / 2;
    let oy = this.y - this.viewH / 2;
    if (this.shake > 0) {
      ox += (Math.random() - 0.5) * this.shake * 2;
      oy += (Math.random() - 0.5) * this.shake * 2;
    }
    return { x: ox, y: oy };
  }

  isVisible(x, y, margin = 50) {
    const off = this.getOffset();
    return x >= off.x - margin && x <= off.x + this.viewW + margin &&
           y >= off.y - margin && y <= off.y + this.viewH + margin;
  }

  resize(w, h) {
    this.viewW = w;
    this.viewH = h;
  }
}

// ============================================================
// WORLD GENERATOR
// ============================================================
class WorldGenerator {
  constructor(seed) {
    this.seed = seed || Math.floor(Math.random() * 999999);
    this.rng = new SeededRandom(this.seed);
    this.tiles = [];
    this.buildings = [];
    this.doors = [];
    this.lootSpots = [];
    this.safehouses = [];
    this.spawnPoints = [];
    this.bossSpawns = [];
    this.npcSpawns = [];
    this.airdropLandingZones = [];
  }

  generate() {
    const W = WORLD_TILES_X;
    const H = WORLD_TILES_Y;
    
    // Initialize with grass
    this.tiles = Array.from({ length: H }, () => Array(W).fill(TILE.GRASS));

    // Define districts
    const districts = [
      { name: 'Residential', x: 10, y: 10, w: 40, h: 40, density: 0.4 },
      { name: 'Commercial', x: 55, y: 10, w: 35, h: 35, density: 0.5 },
      { name: 'Downtown', x: 95, y: 10, w: 45, h: 40, density: 0.6 },
      { name: 'Hospital', x: 10, y: 55, w: 25, h: 25, density: 0.3, special: 'hospital' },
      { name: 'PoliceStation', x: 40, y: 55, w: 20, h: 20, density: 0.3, special: 'police' },
      { name: 'MilitaryCheckpoint', x: 65, y: 50, w: 20, h: 25, density: 0.3, special: 'military' },
      { name: 'Industrial', x: 90, y: 55, w: 45, h: 40, density: 0.45, special: 'industrial' },
      { name: 'SafeDistrict', x: 10, y: 85, w: 30, h: 30, density: 0.25 },
      { name: 'Evacuation', x: 120, y: 100, w: 25, h: 25, density: 0.2, special: 'evac' },
    ];

    // Generate roads grid for each district
    for (const d of districts) {
      this.generateRoads(d);
    }

    // Connect districts with main roads
    this.generateMainRoads(districts);

    // Generate buildings in each district
    for (const d of districts) {
      this.generateBuildings(d);
    }

    // Place special buildings
    this.placeSpecialBuildings(districts);

    // Generate safehouses
    this.generateSafehouses(districts);

    // Generate loot spots
    this.generateLootSpots();

    // Generate zombie spawn points
    this.generateSpawnPoints(districts);

    // Generate boss spawn areas
    this.generateBossSpawns(districts);

    // Generate NPC spawn points
    this.generateNPCSpawns(districts);

    // Generate airdrop landing zones
    this.generateAirdropZones(districts);

    return {
      tiles: this.tiles,
      buildings: this.buildings,
      doors: this.doors,
      lootSpots: this.lootSpots,
      safehouses: this.safehouses,
      spawnPoints: this.spawnPoints,
      bossSpawns: this.bossSpawns,
      npcSpawns: this.npcSpawns,
      airdropLandingZones: this.airdropLandingZones,
      districts,
    };
  }

  generateRoads(district) {
    const { x, y, w, h } = district;
    // Horizontal roads every 8 tiles
    for (let ry = y; ry < y + h; ry += 10) {
      for (let rx = x; rx < x + w; rx++) {
        if (rx >= 0 && rx < WORLD_TILES_X && ry >= 0 && ry < WORLD_TILES_Y) {
          this.tiles[ry][rx] = TILE.ROAD;
          if (ry + 1 < WORLD_TILES_Y) this.tiles[ry + 1][rx] = TILE.ROAD;
        }
      }
    }
    // Vertical roads every 8 tiles
    for (let rx = x; rx < x + w; rx += 12) {
      for (let ry = y; ry < y + h; ry++) {
        if (rx >= 0 && rx < WORLD_TILES_X && ry >= 0 && ry < WORLD_TILES_Y) {
          this.tiles[ry][rx] = TILE.ROAD;
          if (rx + 1 < WORLD_TILES_X) this.tiles[ry][rx + 1] = TILE.ROAD;
        }
      }
    }
    // Sidewalks next to roads
    for (let ry = 0; ry < WORLD_TILES_Y; ry++) {
      for (let rx = 0; rx < WORLD_TILES_X; rx++) {
        if (this.tiles[ry][rx] === TILE.ROAD) {
          const neighbors = [
            [ry - 1, rx], [ry + 1, rx], [ry, rx - 1], [ry, rx + 1]
          ];
          for (const [ny, nx] of neighbors) {
            if (ny >= 0 && ny < WORLD_TILES_Y && nx >= 0 && nx < WORLD_TILES_X) {
              if (this.tiles[ny][nx] === TILE.GRASS) {
                this.tiles[ny][nx] = TILE.SIDEWALK;
              }
            }
          }
        }
      }
    }
  }

  generateMainRoads(districts) {
    // Connect districts with horizontal and vertical main roads
    const mainRoadY = 50;
    const mainRoadX = 85;
    
    for (let rx = 5; rx < WORLD_TILES_X - 5; rx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const ry = mainRoadY + dy;
        if (ry >= 0 && ry < WORLD_TILES_Y && rx >= 0 && rx < WORLD_TILES_X) {
          this.tiles[ry][rx] = TILE.ROAD;
        }
      }
    }
    for (let ry = 5; ry < WORLD_TILES_Y - 5; ry++) {
      for (let dx = -1; dx <= 1; dx++) {
        const rx = mainRoadX + dx;
        if (ry >= 0 && ry < WORLD_TILES_Y && rx >= 0 && rx < WORLD_TILES_X) {
          this.tiles[ry][rx] = TILE.ROAD;
        }
      }
    }
  }

  generateBuildings(district) {
    const { x, y, w, h, density } = district;
    const attempts = Math.floor(w * h * density * 0.03);
    
    for (let i = 0; i < attempts; i++) {
      const bw = this.rng.nextInt(3, 7);
      const bh = this.rng.nextInt(3, 6);
      const bx = this.rng.nextInt(x + 2, x + w - bw - 2);
      const by = this.rng.nextInt(y + 2, y + h - bh - 2);
      
      // Check if area is buildable
      let canBuild = true;
      for (let ty = by; ty < by + bh && canBuild; ty++) {
        for (let tx = bx; tx < bx + bw && canBuild; tx++) {
          if (tx < 0 || tx >= WORLD_TILES_X || ty < 0 || ty >= WORLD_TILES_Y) { canBuild = false; break; }
          if (this.tiles[ty][tx] !== TILE.GRASS && this.tiles[ty][tx] !== TILE.SIDEWALK) {
            canBuild = false;
          }
        }
      }
      if (!canBuild) continue;

      // Check spacing from other buildings
      let tooClose = false;
      for (const b of this.buildings) {
        if (rectIntersects(bx * TILE_SIZE - TILE_SIZE, by * TILE_SIZE - TILE_SIZE, (bw + 2) * TILE_SIZE, (bh + 2) * TILE_SIZE,
                           b.x * TILE_SIZE, b.y * TILE_SIZE, b.w * TILE_SIZE, b.h * TILE_SIZE)) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;

      // Place building
      const building = { x: bx, y: by, w: bw, h: bh, type: district.special || 'generic', rooms: [] };
      
      for (let ty = by; ty < by + bh; ty++) {
        for (let tx = bx; tx < bx + bw; tx++) {
          if (ty === by || ty === by + bh - 1 || tx === bx || tx === bx + bw - 1) {
            this.tiles[ty][tx] = TILE.WALL;
          } else {
            this.tiles[ty][tx] = TILE.FLOOR;
          }
        }
      }

      // Add door(s)
      const doorSide = this.rng.nextInt(0, 3);
      let doorX, doorY;
      switch (doorSide) {
        case 0: // top
          doorX = bx + this.rng.nextInt(1, bw - 2);
          doorY = by;
          break;
        case 1: // bottom
          doorX = bx + this.rng.nextInt(1, bw - 2);
          doorY = by + bh - 1;
          break;
        case 2: // left
          doorX = bx;
          doorY = by + this.rng.nextInt(1, bh - 2);
          break;
        case 3: // right
          doorX = bx + bw - 1;
          doorY = by + this.rng.nextInt(1, bh - 2);
          break;
      }
      this.tiles[doorY][doorX] = TILE.DOOR;
      this.doors.push({ x: doorX, y: doorY, open: false, locked: this.rng.next() < 0.3 });

      // Add rooms for larger buildings
      if (bw >= 5 && bh >= 5) {
        const midX = bx + Math.floor(bw / 2);
        const midY = by + Math.floor(bh / 2);
        // Internal wall
        for (let ty = by + 1; ty < by + bh - 1; ty++) {
          if (this.tiles[ty][midX] === TILE.FLOOR) {
            this.tiles[ty][midX] = TILE.WALL;
          }
        }
        // Door in internal wall
        this.tiles[midY][midX] = TILE.FLOOR;
        building.rooms.push(
          { x: bx + 1, y: by + 1, w: midX - bx - 1, h: bh - 2 },
          { x: midX + 1, y: by + 1, w: bx + bw - midX - 2, h: bh - 2 }
        );
      }

      this.buildings.push(building);
    }
  }

  placeSpecialBuildings(districts) {
    // Hospital
    const hosp = districts.find(d => d.special === 'hospital');
    if (hosp) {
      const bx = hosp.x + 5, by = hosp.y + 5;
      this.placeBuilding(bx, by, 12, 10, 'hospital');
    }
    // Police Station
    const police = districts.find(d => d.special === 'police');
    if (police) {
      const bx = police.x + 3, by = police.y + 3;
      this.placeBuilding(bx, by, 8, 8, 'police');
    }
    // Evacuation Zone
    const evac = districts.find(d => d.special === 'evac');
    if (evac) {
      const cx = evac.x + Math.floor(evac.w / 2);
      const cy = evac.y + Math.floor(evac.h / 2);
      // Clear area
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          const ty = cy + dy, tx = cx + dx;
          if (ty >= 0 && ty < WORLD_TILES_Y && tx >= 0 && tx < WORLD_TILES_X) {
            this.tiles[ty][tx] = TILE.SAFEHOUSE;
          }
        }
      }
    }
  }

  placeBuilding(bx, by, bw, bh, type) {
    for (let ty = by; ty < by + bh; ty++) {
      for (let tx = bx; tx < bx + bw; tx++) {
        if (tx < 0 || tx >= WORLD_TILES_X || ty < 0 || ty >= WORLD_TILES_Y) continue;
        if (ty === by || ty === by + bh - 1 || tx === bx || tx === bx + bw - 1) {
          this.tiles[ty][tx] = TILE.WALL;
        } else {
          this.tiles[ty][tx] = TILE.FLOOR;
        }
      }
    }
    // Door
    const doorX = bx + Math.floor(bw / 2);
    this.tiles[by + bh - 1][doorX] = TILE.DOOR;
    this.doors.push({ x: doorX, y: by + bh - 1, open: false, locked: false });
    this.buildings.push({ x: bx, y: by, w: bw, h: bh, type });
  }

  generateSafehouses(districts) {
    // Place safehouses in safe district
    const safeDistrict = districts.find(d => d.name === 'SafeDistrict') || districts[0];
    for (let i = 0; i < 3; i++) {
      const sx = safeDistrict.x + this.rng.nextInt(3, safeDistrict.w - 3);
      const sy = safeDistrict.y + this.rng.nextInt(3, safeDistrict.h - 3);
      // Mark safe area
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const ty = sy + dy, tx = sx + dx;
          if (ty >= 0 && ty < WORLD_TILES_Y && tx >= 0 && tx < WORLD_TILES_X) {
            this.tiles[ty][tx] = TILE.SAFEHOUSE;
          }
        }
      }
      this.safehouses.push({
        x: sx * TILE_SIZE + TILE_SIZE / 2,
        y: sy * TILE_SIZE + TILE_SIZE / 2,
        storage: [],
        name: `Safehouse ${i + 1}`,
      });
    }
  }

  generateLootSpots() {
    // Place loot spots inside buildings and on streets
    for (const building of this.buildings) {
      const lootCount = this.rng.nextInt(1, 3);
      for (let i = 0; i < lootCount; i++) {
        const lx = building.x + this.rng.nextInt(1, building.w - 2);
        const ly = building.y + this.rng.nextInt(1, building.h - 2);
        if (lx >= 0 && lx < WORLD_TILES_X && ly >= 0 && ly < WORLD_TILES_Y &&
            this.tiles[ly][lx] === TILE.FLOOR) {
          this.lootSpots.push({
            x: lx * TILE_SIZE + TILE_SIZE / 2,
            y: ly * TILE_SIZE + TILE_SIZE / 2,
            type: building.type,
            looted: false,
          });
        }
      }
    }
    // Street loot
    for (let i = 0; i < 80; i++) {
      const lx = this.rng.nextInt(5, WORLD_TILES_X - 5);
      const ly = this.rng.nextInt(5, WORLD_TILES_Y - 5);
      if (this.tiles[ly][lx] === TILE.SIDEWALK || this.tiles[ly][lx] === TILE.ROAD) {
        this.lootSpots.push({
          x: lx * TILE_SIZE + TILE_SIZE / 2,
          y: ly * TILE_SIZE + TILE_SIZE / 2,
          type: 'street',
          looted: false,
        });
      }
    }
  }

  generateSpawnPoints(districts) {
    for (const d of districts) {
      const count = Math.floor(d.w * d.h * 0.015);
      for (let i = 0; i < count; i++) {
        const sx = this.rng.nextInt(d.x, d.x + d.w - 1);
        const sy = this.rng.nextInt(d.y, d.y + d.h - 1);
        if (sx >= 0 && sx < WORLD_TILES_X && sy >= 0 && sy < WORLD_TILES_Y &&
            this.tiles[sy][sx] !== TILE.WALL && this.tiles[sy][sx] !== TILE.DOOR) {
          const isDowntown = d.name === 'Downtown';
          const isHospital = d.special === 'hospital';
          const isMilitary = d.special === 'military';
          let allowedTypes = ['walker', 'walker', 'runner'];
          if (isDowntown) allowedTypes.push('runner', 'armored', 'screamer');
          if (isHospital) allowedTypes.push('spitter', 'mutated', 'radiated');
          if (isMilitary) allowedTypes.push('armored', 'brute', 'elite');

          this.spawnPoints.push({
            x: sx * TILE_SIZE + TILE_SIZE / 2,
            y: sy * TILE_SIZE + TILE_SIZE / 2,
            type: randomChoice(allowedTypes),
            district: d.name,
          });
        }
      }
    }
  }

  generateBossSpawns(districts) {
    // Place bosses in dangerous areas
    const downtown = districts.find(d => d.name === 'Downtown');
    const industrial = districts.find(d => d.special === 'industrial');
    const military = districts.find(d => d.special === 'military');
    
    if (downtown) {
      this.bossSpawns.push({
        x: (downtown.x + downtown.w / 2) * TILE_SIZE,
        y: (downtown.y + downtown.h / 2) * TILE_SIZE,
        bossType: 'radbrute',
        defeated: false,
      });
    }
    if (industrial) {
      this.bossSpawns.push({
        x: (industrial.x + industrial.w / 2) * TILE_SIZE,
        y: (industrial.y + industrial.h / 2) * TILE_SIZE,
        bossType: 'toxic_screamer',
        defeated: false,
      });
    }
    if (military) {
      this.bossSpawns.push({
        x: (military.x + military.w / 2) * TILE_SIZE,
        y: (military.y + military.h / 2) * TILE_SIZE,
        bossType: 'alpha_overlord',
        defeated: false,
      });
    }
  }

  generateNPCSpawns(districts) {
    const types = ['friendly', 'friendly', 'neutral', 'hostile', 'specialist'];
    const names = ['Marcus', 'Elena', 'Kai', 'Sofia', 'Dex', 'Rina', 'Omar', 'Lena', 'Jax', 'Mira',
                   'Viktor', 'Aria', 'Zane', 'Nyx', 'Rex', 'Tara', 'Quinn', 'Sage', 'Finn', 'Kira'];
    const factions = ['Survivors', 'Traders', 'Bandits', 'Medics', 'Engineers'];
    
    for (const d of districts) {
      const count = this.rng.nextInt(1, 3);
      for (let i = 0; i < count; i++) {
        const nx = this.rng.nextInt(d.x + 2, d.x + d.w - 2);
        const ny = this.rng.nextInt(d.y + 2, d.y + d.h - 2);
        if (nx < 0 || nx >= WORLD_TILES_X || ny < 0 || ny >= WORLD_TILES_Y) continue;
        if (this.tiles[ny][nx] === TILE.WALL) continue;

        const npcType = randomChoice(types);
        this.npcSpawns.push({
          x: nx * TILE_SIZE + TILE_SIZE / 2,
          y: ny * TILE_SIZE + TILE_SIZE / 2,
          type: npcType,
          name: randomChoice(names),
          faction: randomChoice(factions),
          district: d.name,
        });
      }
    }
  }

  generateAirdropZones(districts) {
    for (const d of districts) {
      if (d.name === 'Evacuation' || d.name === 'SafeDistrict') continue;
      // Find open road areas
      for (let ty = d.y + 2; ty < d.y + d.h - 2; ty += 5) {
        for (let tx = d.x + 2; tx < d.x + d.w - 2; tx += 5) {
          if (tx < WORLD_TILES_X && ty < WORLD_TILES_Y &&
              (this.tiles[ty][tx] === TILE.ROAD || this.tiles[ty][tx] === TILE.SIDEWALK)) {
            this.airdropLandingZones.push({
              x: tx * TILE_SIZE + TILE_SIZE / 2,
              y: ty * TILE_SIZE + TILE_SIZE / 2,
            });
          }
        }
      }
    }
  }
}

// ============================================================
// COLLISION SYSTEM
// ============================================================
class CollisionSystem {
  constructor(world) {
    this.world = world;
  }

  isSolid(tileX, tileY) {
    if (tileX < 0 || tileX >= WORLD_TILES_X || tileY < 0 || tileY >= WORLD_TILES_Y) return true;
    const tile = this.world.tiles[tileY][tileX];
    return tile === TILE.WALL;
  }

  isDoor(tileX, tileY) {
    if (tileX < 0 || tileX >= WORLD_TILES_X || tileY < 0 || tileY >= WORLD_TILES_Y) return false;
    return this.world.tiles[tileY][tileX] === TILE.DOOR;
  }

  getTile(tileX, tileY) {
    if (tileX < 0 || tileX >= WORLD_TILES_X || tileY < 0 || tileY >= WORLD_TILES_Y) return TILE.WALL;
    return this.world.tiles[tileY][tileX];
  }

  // Check circle vs tile collision
  resolveCircleVsTiles(x, y, radius) {
    let resultX = x, resultY = y;
    const minTX = Math.floor((x - radius) / TILE_SIZE);
    const maxTX = Math.floor((x + radius) / TILE_SIZE);
    const minTY = Math.floor((y - radius) / TILE_SIZE);
    const maxTY = Math.floor((y + radius) / TILE_SIZE);

    for (let ty = minTY; ty <= maxTY; ty++) {
      for (let tx = minTX; tx <= maxTX; tx++) {
        if (!this.isSolid(tx, ty)) continue;
        
        // Find closest point on tile to circle center
        const closestX = clamp(resultX, tx * TILE_SIZE, (tx + 1) * TILE_SIZE);
        const closestY = clamp(resultY, ty * TILE_SIZE, (ty + 1) * TILE_SIZE);
        
        const dx = resultX - closestX;
        const dy = resultY - closestY;
        const d = Math.sqrt(dx * dx + dy * dy);
        
        if (d < radius && d > 0) {
          const overlap = radius - d;
          resultX += (dx / d) * overlap;
          resultY += (dy / d) * overlap;
        } else if (d === 0) {
          // Circle center is inside the tile
          const centerTX = tx * TILE_SIZE + TILE_SIZE / 2;
          const centerTY = ty * TILE_SIZE + TILE_SIZE / 2;
          const pushX = resultX - centerTX;
          const pushY = resultY - centerTY;
          const pushLen = Math.sqrt(pushX * pushX + pushY * pushY) || 1;
          resultX += (pushX / pushLen) * (radius + TILE_SIZE / 2);
          resultY += (pushY / pushLen) * (radius + TILE_SIZE / 2);
        }
      }
    }

    // Also check doors that are closed
    for (let ty = minTY; ty <= maxTY; ty++) {
      for (let tx = minTX; tx <= maxTX; tx++) {
        if (!this.isDoor(tx, ty)) continue;
        const door = this.world.doors.find(d => d.x === tx && d.y === ty);
        if (door && door.open) continue;

        const closestX = clamp(resultX, tx * TILE_SIZE, (tx + 1) * TILE_SIZE);
        const closestY = clamp(resultY, ty * TILE_SIZE, (ty + 1) * TILE_SIZE);
        const dx = resultX - closestX;
        const dy = resultY - closestY;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < radius && d > 0) {
          resultX += (dx / d) * (radius - d);
          resultY += (dy / d) * (radius - d);
        }
      }
    }

    return { x: resultX, y: resultY };
  }

  // Line of sight check
  hasLineOfSight(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const d = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.ceil(d / (TILE_SIZE / 2));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const cx = x1 + dx * t;
      const cy = y1 + dy * t;
      const tx = Math.floor(cx / TILE_SIZE);
      const ty = Math.floor(cy / TILE_SIZE);
      if (this.isSolid(tx, ty)) return false;
    }
    return true;
  }
}

// ============================================================
// ENTITY: PLAYER
// ============================================================
class Player {
  constructor(role, x, y) {
    this.id = 'player';
    this.role = role;
    this.roleData = ROLES[role];
    this.x = x;
    this.y = y;
    this.radius = 12;
    this.angle = 0;

    // Stats from role
    const stats = this.roleData.stats;
    this.maxHP = stats.maxHP;
    this.hp = this.maxHP;
    this.moveSpeed = stats.moveSpeed;
    this.sprintSpeed = stats.sprintSpeed;
    this.staminaMax = stats.staminaMax;
    this.stamina = this.staminaMax;
    this.staminaRegen = stats.staminaRegen;
    this.staminaDrain = stats.staminaDrain;

    // Survival
    this.hunger = 100;
    this.thirst = 100;
    this.hungerRate = stats.hungerRate;
    this.thirstRate = stats.thirstRate;
    this.bleeding = 0;
    this.infection = 0;

    // Combat
    this.currentWeaponIdx = 0;
    this.weapons = [];
    this.ammo = {};
    this.armor = null;
    this.armorDurability = 0;

    // Role skill
    this.skillCooldown = 0;
    this.skillActive = false;
    this.skillTimer = 0;

    // Killer First Blood
    this.firstBloodActive = false;
    this.firstBloodTimer = 0;
    this.killSpeedPenaltyTimer = 0;
    this.berserkTimer = 0;

    // Soldier Suppressive Fire
    this.suppressiveFireActive = false;
    this.suppressiveFireTimer = 0;

    // Hacker hack
    this.hackTarget = null;

    // Progression
    this.level = 1;
    this.xp = 0;
    this.xpToNextLevel = 100;
    this.skillPoints = 0;

    // Inventory
    this.inventory = [];
    this.maxInventorySlots = stats.inventorySlots;

    // State
    this.sprinting = false;
    this.alive = true;
    this.invincibleTimer = 0;
    this.interactTarget = null;
    this.nearbyLoot = [];
    this.nearbyNPC = null;
    this.nearbyDoor = null;
    this.nearbyChest = null;
    this.nearbySafehouse = null;

    // Quests
    this.activeQuests = [];
    this.completedQuests = [];

    // Stats tracking
    this.stats = { kills: 0, bossKills: 0, itemsLooted: 0, distanceTraveled: 0, damageDealt: 0 };
  }

  getWeapon() {
    return this.weapons[this.currentWeaponIdx] || null;
  }

  getEffectiveSpeed() {
    let speed = this.sprinting ? this.sprintSpeed : this.moveSpeed;
    // Killer kill speed penalty (not during First Blood)
    if (this.role === 'killer' && this.killSpeedPenaltyTimer > 0 && !this.firstBloodActive) {
      speed *= (1 - this.roleData.weaknesses.killSpeedPenalty);
    }
    // First Blood speed bonus
    if (this.firstBloodActive) {
      speed *= this.roleData.skill.speedMultiplier;
    }
    // Weapon movement penalty
    const weapon = this.getWeapon();
    if (weapon && weapon.movementPenalty) {
      speed *= weapon.movementPenalty;
    }
    // Berserk (Killer) - random movement
    if (this.berserkTimer > 0) {
      speed *= 1.3;
    }
    return speed;
  }

  getDamageModifiers() {
    const mods = { flat: 0, mult: 1.0 };
    const bonuses = this.roleData.bonuses;

    // Role bonuses
    if (this.role === 'soldier' && this.getWeapon() && this.getWeapon().type !== WEAPON_TYPES.MELEE) {
      mods.mult *= (1 + bonuses.rangedDamage);
    }
    if (this.role === 'hacker' && this.getWeapon() && this.getWeapon().type === WEAPON_TYPES.MELEE) {
      mods.mult *= (1 + bonuses.meleeDamage);
    }
    // Killer legendary bonus
    if (this.role === 'killer' && this.getWeapon() && this.getWeapon().rarity === RARITY.LEGENDARY) {
      mods.mult *= (1 + bonuses.legendaryDamage);
    }
    // First Blood
    if (this.firstBloodActive) {
      mods.mult *= this.roleData.skill.damageMultiplier;
    }
    return mods;
  }

  takeDamage(amount, source = 'generic') {
    if (!this.alive || this.invincibleTimer > 0) return 0;

    // Killer First Blood immunity
    if (this.firstBloodActive) {
      if (source === 'boss') {
        amount *= (1 - this.roleData.skill.bossDamageReduction);
      } else if (source === 'zombie' || source === 'bullet') {
        return 0; // immune to regular attacks
      }
    }

    // Armor reduction
    if (this.armor && this.armorDurability > 0) {
      const armorReduction = this.armor.protection || 0.3;
      const reduced = amount * (1 - armorReduction);
      this.armorDurability -= amount * 0.5;
      if (this.armorDurability <= 0) {
        this.armor = null;
        this.armorDurability = 0;
      }
      amount = reduced;
    }

    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
    }
    return amount;
  }

  heal(amount) {
    this.hp = Math.min(this.maxHP, this.hp + amount);
  }

  addXP(amount) {
    this.xp += amount;
    while (this.xp >= this.xpToNextLevel) {
      this.xp -= this.xpToNextLevel;
      this.level++;
      this.xpToNextLevel = Math.floor(this.xpToNextLevel * 1.5);
      this.skillPoints++;
      // Level up bonuses
      this.maxHP += 5;
      this.hp = Math.min(this.hp + 20, this.maxHP);
      this.staminaMax += 3;
      this.stamina = this.staminaMax;
    }
  }
}

// ============================================================
// ENTITY: ZOMBIE
// ============================================================
class Zombie {
  constructor(type, x, y) {
    const data = ZOMBIE_TYPES[type];
    this.id = generateId();
    this.type = type;
    this.data = data;
    this.x = x;
    this.y = y;
    this.radius = data.size || 12;
    this.angle = Math.random() * Math.PI * 2;
    this.hp = data.hp;
    this.maxHp = data.hp;
    this.damage = data.damage;
    this.moveSpeed = data.moveSpeed;
    this.detectionRange = data.detectionRange;
    this.attackRange = data.attackRange;
    this.attackCooldown = data.attackCooldown;
    this.resistance = data.resistance || 0;
    this.lootChance = data.lootChance || 0.3;
    this.xpReward = data.xpReward || 10;

    // AI State
    this.state = ZOMBIE_STATES.IDLE;
    this.stateTimer = 0;
    this.attackTimer = 0;
    this.stunTimer = 0;
    this.targetX = x;
    this.targetY = y;
    this.patrolTarget = null;
    this.investigateX = 0;
    this.investigateY = 0;
    this.aggroTarget = null;

    // Special abilities
    this.screamCooldown = 0;
    this.regenTimer = 0;
    this.isBoss = false;
    this.bossData = null;
    this.bossPhase = 0;
    this.bossAttackTimers = {};
    this.vulnerable = false;
    this.vulnerableTimer = 0;
  }

  update(dt, player, collisionSystem, entities) {
    if (this.hp <= 0) {
      this.state = ZOMBIE_STATES.DEAD;
      return;
    }

    // Update timers
    this.attackTimer = Math.max(0, this.attackTimer - dt);
    this.stunTimer = Math.max(0, this.stunTimer - dt);
    this.screamCooldown = Math.max(0, this.screamCooldown - dt);
    this.stateTimer += dt;

    if (this.vulnerable) {
      this.vulnerableTimer -= dt;
      if (this.vulnerableTimer <= 0) this.vulnerable = false;
    }

    // Regeneration
    if (this.data.regeneration) {
      this.regenTimer += dt;
      if (this.regenTimer >= 1) {
        this.regenTimer = 0;
        this.hp = Math.min(this.maxHp, this.hp + this.data.regeneration);
      }
    }

    // Stunned state
    if (this.stunTimer > 0) {
      this.state = ZOMBIE_STATES.STUNNED;
      return;
    }

    // Boss phase management
    if (this.isBoss) {
      this.updateBossPhase(dt, player, collisionSystem, entities);
      return;
    }

    // Regular zombie AI
    const distToPlayer = dist(this.x, this.y, player.x, player.y);
    const canSeePlayer = distToPlayer < this.detectionRange && 
                         collisionSystem.hasLineOfSight(this.x, this.y, player.x, player.y);

    switch (this.state) {
      case ZOMBIE_STATES.IDLE:
        if (canSeePlayer) {
          this.state = ZOMBIE_STATES.CHASE;
          this.aggroTarget = player;
        } else {
          // Random chance to start patrolling
          if (this.stateTimer > 2 + Math.random() * 3) {
            this.state = ZOMBIE_STATES.PATROL;
            this.stateTimer = 0;
            this.patrolTarget = {
              x: this.x + (Math.random() - 0.5) * 200,
              y: this.y + (Math.random() - 0.5) * 200,
            };
          }
        }
        break;

      case ZOMBIE_STATES.PATROL:
        if (canSeePlayer) {
          this.state = ZOMBIE_STATES.CHASE;
          this.aggroTarget = player;
          break;
        }
        if (this.patrolTarget) {
          this.moveToward(this.patrolTarget.x, this.patrolTarget.y, this.moveSpeed * 0.4, dt, collisionSystem);
          if (dist(this.x, this.y, this.patrolTarget.x, this.patrolTarget.y) < 20) {
            this.state = ZOMBIE_STATES.IDLE;
            this.stateTimer = 0;
            this.patrolTarget = null;
          }
        } else {
          this.state = ZOMBIE_STATES.IDLE;
          this.stateTimer = 0;
        }
        break;

      case ZOMBIE_STATES.INVESTIGATE:
        if (canSeePlayer) {
          this.state = ZOMBIE_STATES.CHASE;
          this.aggroTarget = player;
          break;
        }
        this.moveToward(this.investigateX, this.investigateY, this.moveSpeed * 0.6, dt, collisionSystem);
        if (dist(this.x, this.y, this.investigateX, this.investigateY) < 30) {
          this.state = ZOMBIE_STATES.IDLE;
          this.stateTimer = 0;
        }
        break;

      case ZOMBIE_STATES.CHASE:
        if (!canSeePlayer && distToPlayer > this.detectionRange * 1.5) {
          this.state = ZOMBIE_STATES.INVESTIGATE;
          this.investigateX = player.x;
          this.investigateY = player.y;
          this.stateTimer = 0;
          break;
        }
        this.moveToward(player.x, player.y, this.moveSpeed, dt, collisionSystem);
        
        // Screamer ability
        if (this.data.screamRadius && this.screamCooldown <= 0 && distToPlayer < this.data.screamRadius) {
          this.performScream(entities);
        }
        
        // Spitter ranged attack
        if (this.data.projectileSpeed && distToPlayer < this.data.attackRange && distToPlayer > this.data.meleeRange) {
          if (this.attackTimer <= 0) {
            this.attackTimer = this.attackCooldown;
            return { type: 'spit', x: this.x, y: this.y, targetX: player.x, targetY: player.y };
          }
        }
        
        // Melee attack
        if (distToPlayer < this.attackRange + player.radius) {
          this.state = ZOMBIE_STATES.ATTACK;
        }
        break;

      case ZOMBIE_STATES.ATTACK:
        if (distToPlayer > this.attackRange + player.radius + 10) {
          this.state = ZOMBIE_STATES.CHASE;
          break;
        }
        this.angle = angle(this.x, this.y, player.x, player.y);
        if (this.attackTimer <= 0) {
          this.attackTimer = this.attackCooldown;
          let dmg = this.damage;
          if (this.data.radiationDamage) dmg += this.data.radiationDamage;
          return { type: 'melee_attack', damage: dmg, source: this };
        }
        break;
    }
    return null;
  }

  moveToward(tx, ty, speed, dt, collisionSystem) {
    const dx = tx - this.x;
    const dy = ty - this.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 1) return;
    
    this.angle = Math.atan2(dy, dx);
    const nx = dx / d;
    const ny = dy / d;
    let newX = this.x + nx * speed * dt;
    let newY = this.y + ny * speed * dt;
    
    const resolved = collisionSystem.resolveCircleVsTiles(newX, newY, this.radius);
    this.x = resolved.x;
    this.y = resolved.y;
  }

  takeDamage(amount) {
    const effective = amount * (1 - this.resistance);
    if (this.vulnerable) {
      this.hp -= effective * 1.5;
    } else {
      this.hp -= effective;
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.state = ZOMBIE_STATES.DEAD;
    }
    return effective;
  }

  performScream(entities) {
    this.screamCooldown = this.data.screamCooldown || 8;
    // Attract nearby zombies
    return { type: 'scream', x: this.x, y: this.y, radius: this.data.screamRadius, count: this.data.maxCallPerScream || 4 };
  }

  // Boss-specific AI
  updateBossPhase(dt, player, collisionSystem, entities) {
    if (!this.bossData) return;
    
    const hpPercent = this.hp / this.maxHp;
    const phases = this.bossData.phases;
    
    // Determine current phase
    let newPhase = 0;
    for (let i = phases.length - 1; i >= 0; i--) {
      if (hpPercent <= phases[i].hpThreshold) {
        newPhase = i;
      }
    }
    if (newPhase !== this.bossPhase) {
      this.bossPhase = newPhase;
      // Update stats for phase
      if (phases[newPhase].speed) this.moveSpeed = phases[newPhase].speed;
      if (phases[newPhase].damage) this.damage = phases[newPhase].damage;
      if (phases[newPhase].resistance !== undefined) this.resistance = phases[newPhase].resistance;
    }

    const distToPlayer = dist(this.x, this.y, player.x, player.y);
    const phase = phases[this.bossPhase];
    
    // Update boss attack timers
    for (const key in this.bossAttackTimers) {
      this.bossAttackTimers[key] = Math.max(0, (this.bossAttackTimers[key] || 0) - dt);
    }
    if (this.vulnerable) {
      this.vulnerableTimer -= dt;
      if (this.vulnerableTimer <= 0) this.vulnerable = false;
    }

    // Move toward player
    if (distToPlayer > this.attackRange) {
      this.moveToward(player.x, player.y, this.moveSpeed, dt, collisionSystem);
    }

    // Try boss attacks
    const attacks = this.bossData.attacks;
    for (const attackName in attacks) {
      const attack = attacks[attackName];
      if (!this.bossAttackTimers[attackName] || this.bossAttackTimers[attackName] <= 0) {
        if (attack.range && distToPlayer > attack.range) continue;
        if (attack.radius && distToPlayer > attack.radius) continue;
        
        this.bossAttackTimers[attackName] = attack.cooldown;
        
        if (attackName === 'charge' || attackName === 'chargeAttack') {
          this.angle = angle(this.x, this.y, player.x, player.y);
          this.vulnerable = true;
          this.vulnerableTimer = this.bossData.vulnerabilities?.afterCharge?.duration || 3;
          return { type: 'boss_attack', attack: attackName, boss: this, ...attack };
        }
        if (attackName === 'screamSummon' || attackName === 'summon') {
          return { type: 'boss_summon', count: attack.count || 3, x: this.x, y: this.y, boss: this };
        }
        if (attack.damage) {
          return { type: 'boss_attack', attack: attackName, boss: this, ...attack };
        }
      }
    }

    // Basic melee if in range
    if (distToPlayer < this.attackRange + player.radius && this.attackTimer <= 0) {
      this.attackTimer = this.attackCooldown;
      this.angle = angle(this.x, this.y, player.x, player.y);
      return { type: 'melee_attack', damage: this.damage, source: this };
    }

    return null;
  }
}

// ============================================================
// ENTITY: NPC
// ============================================================
class NPC {
  constructor(data) {
    this.id = generateId();
    this.x = data.x;
    this.y = data.y;
    this.radius = 12;
    this.type = data.type; // friendly, neutral, hostile, specialist
    this.name = data.name;
    this.faction = data.faction;
    this.alive = true;
    this.hp = 80;
    this.maxHp = 80;
    this.angle = Math.random() * Math.PI * 2;
    this.state = 'idle';
    this.hostile = data.type === 'hostile';
    this.trust = data.type === 'friendly' ? 50 : (data.type === 'neutral' ? 25 : 0);
    this.dialog = this.generateDialog(data);
    this.tradeItems = this.generateTradeItems();
    this.questAvailable = Math.random() < 0.4;
    this.quest = this.questAvailable ? this.generateQuest() : null;
    this.wanderTimer = 0;
    this.wanderTarget = null;
    this.attackTimer = 0;
    this.moveSpeed = 60;
    this.damage = 12;
    this.detectionRange = 200;
  }

  generateDialog(data) {
    const greetings = {
      friendly: [
        `Hey survivor! I'm ${data.name} from ${data.faction}. Need anything?`,
        `Watch your back out here. The undead are everywhere.`,
        `Glad to see another living soul. What brings you here?`,
      ],
      neutral: [
        `I don't know you. State your business.`,
        `You seem capable enough. But I'm not trusting anyone easily.`,
        `Keep your distance. We can talk, but that's it for now.`,
      ],
      hostile: [
        `You're in our territory now. Leave or face the consequences.`,
        `Hand over your supplies and maybe we'll let you go.`,
        `Another wanderer about to learn a hard lesson.`,
      ],
      specialist: [
        `I can help you with ${data.faction === 'Medics' ? 'medical supplies' : data.faction === 'Engineers' ? 'repairs and crafting' : 'specialized services'}. For a price.`,
        `My skills aren't free, but they're worth it.`,
      ],
    };
    const pool = greetings[data.type] || greetings.neutral;
    return {
      greeting: randomChoice(pool),
      options: this.getInteractionOptions(data.type),
    };
  }

  getInteractionOptions(type) {
    switch (type) {
      case 'friendly':
        return [
          { text: 'Trade', action: 'trade' },
          { text: 'Ask for information', action: 'info' },
          { text: 'Give food', action: 'give_food', trustChange: 10 },
          { text: 'Leave', action: 'leave' },
        ];
      case 'neutral':
        return [
          { text: 'Trade', action: 'trade', trustRequired: 20 },
          { text: 'Offer food', action: 'give_food', trustChange: 15 },
          { text: 'Ask about area', action: 'info', trustRequired: 10 },
          { text: 'Leave', action: 'leave' },
        ];
      case 'hostile':
        return [
          { text: 'Intimidate', action: 'intimidate' },
          { text: 'Offer supplies', action: 'bribe', trustChange: 20 },
          { text: 'Fight', action: 'fight' },
          { text: 'Leave quickly', action: 'leave' },
        ];
      case 'specialist':
        return [
          { text: 'Use services', action: 'services' },
          { text: 'Trade', action: 'trade' },
          { text: 'Leave', action: 'leave' },
        ];
      default:
        return [{ text: 'Leave', action: 'leave' }];
    }
  }

  generateTradeItems() {
    const items = [];
    const count = randomInt(2, 5);
    for (let i = 0; i < count; i++) {
      const r = Math.random();
      if (r < 0.3) {
        items.push({ type: 'food', name: randomChoice(['Canned Food', 'Energy Bar', 'MRE']), price: randomInt(5, 15), healAmount: randomInt(10, 25) });
      } else if (r < 0.5) {
        items.push({ type: 'water', name: randomChoice(['Water Bottle', 'Purified Water']), price: randomInt(5, 12), thirstRestore: randomInt(20, 40) });
      } else if (r < 0.7) {
        items.push({ type: 'medical', name: randomChoice(['Bandage', 'Med Kit', 'Painkillers']), price: randomInt(10, 30), healAmount: randomInt(15, 50) });
      } else if (r < 0.85) {
        items.push({ type: 'ammo', name: 'Ammo Pack', price: randomInt(8, 20), ammoAmount: randomInt(10, 30) });
      } else {
        items.push({ type: 'weapon', name: randomChoice(['Combat Knife', 'Pistol']), price: randomInt(20, 50) });
      }
    }
    return items;
  }

  generateQuest() {
    const questTypes = [
      { type: 'kill', name: 'Clear the Area', description: 'Eliminate 10 zombies in the area', target: 10, reward: 50, rewardItem: 'med_kit' },
      { type: 'fetch', name: 'Supply Run', description: 'Find and bring back medical supplies', target: 3, reward: 75, rewardItem: 'rare_weapon' },
      { type: 'explore', name: 'Scout Mission', description: 'Explore the nearby district', target: 1, reward: 40, rewardItem: 'ammo_pack' },
      { type: 'boss', name: 'Eliminate the Threat', description: 'Defeat the boss zombie in the area', target: 1, reward: 200, rewardItem: 'legendary_item' },
    ];
    return randomChoice(questTypes);
  }

  update(dt, player, collisionSystem) {
    if (!this.alive) return;
    
    this.attackTimer = Math.max(0, this.attackTimer - dt);
    
    if (this.hostile && this.state !== 'dead') {
      const distToPlayer = dist(this.x, this.y, player.x, player.y);
      if (distToPlayer < this.detectionRange && collisionSystem.hasLineOfSight(this.x, this.y, player.x, player.y)) {
        if (distToPlayer < 30) {
          if (this.attackTimer <= 0) {
            this.attackTimer = 1.5;
            return { type: 'npc_attack', damage: this.damage };
          }
        } else {
          // Move toward player
          const dx = player.x - this.x;
          const dy = player.y - this.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d > 0) {
            this.angle = Math.atan2(dy, dx);
            const resolved = collisionSystem.resolveCircleVsTiles(
              this.x + (dx / d) * this.moveSpeed * dt,
              this.y + (dy / d) * this.moveSpeed * dt,
              this.radius
            );
            this.x = resolved.x;
            this.y = resolved.y;
          }
        }
      }
    }
    return null;
  }

  interact(player) {
    return {
      type: 'dialog',
      npc: this,
      dialog: this.dialog,
      tradeItems: this.tradeItems,
      quest: this.questAvailable && this.quest ? this.quest : null,
    };
  }

  takeDamage(amount) {
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.hostile = true;
    }
    // Being attacked makes NPCs hostile
    if (this.type !== 'hostile') {
      this.hostile = true;
      this.trust = Math.max(0, this.trust - 30);
    }
  }
}

// ============================================================
// PROJECTILE
// ============================================================
class Projectile {
  constructor(x, y, angle, speed, damage, range, owner, data = {}) {
    this.id = generateId();
    this.x = x;
    this.y = y;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.speed = speed;
    this.damage = damage;
    this.range = range;
    this.owner = owner; // 'player' or zombie id
    this.distTraveled = 0;
    this.alive = true;
    this.radius = data.radius || 3;
    this.explosive = data.explosive || false;
    this.explosionRadius = data.explosionRadius || 0;
    this.color = data.color || '#ffff00';
    this.trailColor = data.trailColor || '#ffaa00';
    this.trail = [];
  }

  update(dt, collisionSystem) {
    if (!this.alive) return;
    
    // Trail
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 8) this.trail.shift();
    
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.distTraveled += this.speed * dt;
    
    if (this.distTraveled >= this.range) {
      this.alive = false;
      return;
    }

    // Wall collision
    const tx = Math.floor(this.x / TILE_SIZE);
    const ty = Math.floor(this.y / TILE_SIZE);
    if (collisionSystem.isSolid(tx, ty)) {
      this.alive = false;
    }
  }
}

// ============================================================
// PARTICLE SYSTEM
// ============================================================
class ParticleSystem {
  constructor() {
    this.particles = [];
  }

  emit(x, y, count, options = {}) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (options.speed || 100) * (0.5 + Math.random() * 0.5);
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: options.life || 0.5,
        maxLife: options.life || 0.5,
        color: options.color || '#ff4444',
        size: options.size || (2 + Math.random() * 3),
        gravity: options.gravity || 0,
      });
    }
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  render(ctx, camera) {
    const off = camera.getOffset();
    for (const p of this.particles) {
      const alpha = p.life / p.maxLife;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - off.x - p.size / 2, p.y - off.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }
}

// ============================================================
// LOOT TABLE & SYSTEM
// ============================================================
class LootSystem {
  constructor() {
    this.droppedItems = [];
  }

  generateLoot(spotType) {
    const items = [];
    const roll = Math.random();
    
    switch (spotType) {
      case 'hospital':
        if (roll < 0.6) items.push({ type: 'medical', name: 'Med Kit', healAmount: 40, stackable: true, count: 1 });
        if (roll < 0.4) items.push({ type: 'medical', name: 'Bandage', healAmount: 15, stackable: true, count: 2 });
        if (roll < 0.2) items.push({ type: 'medical', name: 'Antibiotics', infectionCure: true, stackable: true, count: 1 });
        break;
      case 'police':
        if (roll < 0.5) items.push({ type: 'weapon', weapon: { ...WEAPONS.pistol }, name: 'Pistol' });
        if (roll < 0.3) items.push({ type: 'ammo', name: 'Pistol Ammo', ammoType: 'pistol', ammoAmount: randomInt(12, 36) });
        if (roll < 0.15) items.push({ type: 'weapon', weapon: { ...WEAPONS.shotgun }, name: 'Shotgun' });
        if (roll < 0.2) items.push({ type: 'armor', name: 'Kevlar Vest', protection: 0.3, durability: 50, maxDurability: 50 });
        break;
      case 'military':
        if (roll < 0.3) items.push({ type: 'weapon', weapon: { ...WEAPONS.assault_rifle }, name: 'Assault Rifle' });
        if (roll < 0.2) items.push({ type: 'weapon', weapon: { ...WEAPONS.ak47 }, name: 'AK-47' });
        if (roll < 0.1) items.push({ type: 'weapon', weapon: { ...WEAPONS.sniper_rifle }, name: 'Sniper Rifle' });
        if (roll < 0.4) items.push({ type: 'ammo', name: 'Rifle Ammo', ammoType: 'rifle', ammoAmount: randomInt(20, 60) });
        if (roll < 0.15) items.push({ type: 'armor', name: 'Military Armor', protection: 0.5, durability: 80, maxDurability: 80 });
        break;
      case 'industrial':
        if (roll < 0.4) items.push({ type: 'material', name: 'Scrap Metal', stackable: true, count: randomInt(1, 3) });
        if (roll < 0.3) items.push({ type: 'material', name: 'Electronics', stackable: true, count: 1 });
        if (roll < 0.2) items.push({ type: 'weapon', weapon: { ...WEAPONS.crowbar }, name: 'Crowbar' });
        if (roll < 0.15) items.push({ type: 'weapon', weapon: { ...WEAPONS.tactical_axe }, name: 'Tactical Axe' });
        break;
      default: // street/generic
        if (roll < 0.3) items.push({ type: 'food', name: randomChoice(['Canned Food', 'Energy Bar', 'Crackers']), healAmount: randomInt(5, 15), hungerRestore: randomInt(15, 30), stackable: true, count: 1 });
        if (roll < 0.25) items.push({ type: 'water', name: randomChoice(['Water Bottle', 'Soda']), thirstRestore: randomInt(15, 30), stackable: true, count: 1 });
        if (roll < 0.15) items.push({ type: 'medical', name: 'Bandage', healAmount: 10, stackable: true, count: 1 });
        if (roll < 0.1) items.push({ type: 'ammo', name: randomChoice(['Pistol Ammo', 'SMG Ammo']), ammoType: randomChoice(['pistol', 'smg']), ammoAmount: randomInt(5, 15) });
        if (roll < 0.05) items.push({ type: 'weapon', weapon: { ...WEAPONS.combat_knife }, name: 'Combat Knife' });
        break;
    }

    // Random weapon drop chance
    if (Math.random() < 0.08) {
      const rarity = weightedRandom([
        { value: 'common', weight: RARITY_WEIGHTS.common },
        { value: 'uncommon', weight: RARITY_WEIGHTS.uncommon },
        { value: 'rare', weight: RARITY_WEIGHTS.rare },
        { value: 'epic', weight: RARITY_WEIGHTS.epic },
        { value: 'legendary', weight: RARITY_WEIGHTS.legendary },
      ]);
      const weapon = getRandomWeapon(rarity);
      items.push({ type: 'weapon', weapon: { ...weapon }, name: weapon.name });
    }

    return items;
  }

  dropLoot(x, y, items) {
    for (const item of items) {
      this.droppedItems.push({
        id: generateId(),
        x: x + (Math.random() - 0.5) * 30,
        y: y + (Math.random() - 0.5) * 30,
        item,
        bobOffset: Math.random() * Math.PI * 2,
      });
    }
  }

  dropZombieLoot(zombie) {
    if (Math.random() < zombie.lootChance) {
      const items = [];
      if (Math.random() < 0.4) items.push({ type: 'food', name: 'Ration', healAmount: 5, hungerRestore: 10, stackable: true, count: 1 });
      if (Math.random() < 0.3) items.push({ type: 'ammo', name: 'Ammo', ammoType: randomChoice(['pistol', 'smg', 'rifle']), ammoAmount: randomInt(3, 10) });
      if (Math.random() < 0.15) items.push({ type: 'medical', name: 'Bandage', healAmount: 10, stackable: true, count: 1 });
      if (Math.random() < 0.05) items.push({ type: 'material', name: 'Scrap', stackable: true, count: 1 });
      this.dropLoot(zombie.x, zombie.y, items);
    }
  }

  dropBossLoot(boss) {
    const items = [];
    // Always drop something good
    const rarity = weightedRandom([
      { value: 'rare', weight: 30 },
      { value: 'epic', weight: 50 },
      { value: 'legendary', weight: 20 },
    ]);
    const weapon = getRandomWeapon(rarity);
    items.push({ type: 'weapon', weapon: { ...weapon }, name: weapon.name });
    items.push({ type: 'armor', name: 'Boss Armor', protection: 0.5, durability: 100, maxDurability: 100 });
    items.push({ type: 'medical', name: 'Med Kit', healAmount: 60, stackable: true, count: 2 });
    items.push({ type: 'material', name: 'Rare Material', stackable: true, count: 3 });
    this.dropLoot(boss.x, boss.y, items);
  }
}

// ============================================================
// AIRDROP SYSTEM
// ============================================================
class AirdropSystem {
  constructor(world) {
    this.world = world;
    this.airdrops = [];
    this.nextDropTime = randomRange(60, 120); // first drop after 1-2 min
    this.timer = 0;
    this.active = false;
  }

  update(dt, player) {
    this.timer += dt;
    
    if (this.timer >= this.nextDropTime && !this.active) {
      this.spawnAirdrop();
    }

    for (let i = this.airdrops.length - 1; i >= 0; i--) {
      const drop = this.airdrops[i];
      if (drop.status === 'incoming') {
        drop.fallTimer -= dt;
        if (drop.fallTimer <= 0) {
          drop.status = 'landed';
          drop.smokeTimer = 30;
        }
      } else if (drop.status === 'landed') {
        drop.smokeTimer -= dt;
        if (drop.smokeTimer <= 0) {
          drop.status = 'expired';
        }
      } else if (drop.status === 'looted' || drop.status === 'expired') {
        drop.removeTimer -= dt;
        if (drop.removeTimer <= 0) {
          this.airdrops.splice(i, 1);
        }
      }
    }
  }

  spawnAirdrop() {
    const zones = this.world.airdropLandingZones;
    if (zones.length === 0) return;
    
    const zone = randomChoice(zones);
    const drop = {
      id: generateId(),
      x: zone.x,
      y: zone.y,
      status: 'incoming',
      fallTimer: 5, // 5 seconds to land
      smokeTimer: 120, // stays for 2 minutes
      removeTimer: 10,
      loot: this.generateAirdropLoot(),
      notified: false,
    };
    this.airdrops.push(drop);
    this.active = true;
    this.timer = 0;
    this.nextDropTime = randomRange(90, 180);
    return drop;
  }

  generateAirdropLoot() {
    const items = [];
    // Guaranteed weapon
    const rarity = weightedRandom([
      { value: 'rare', weight: 25 },
      { value: 'epic', weight: 50 },
      { value: 'legendary', weight: 25 },
    ]);
    const weapon = getRandomWeapon(rarity);
    items.push({ type: 'weapon', weapon: { ...weapon }, name: weapon.name });
    
    // Supplies
    items.push({ type: 'medical', name: 'Med Kit', healAmount: 50, stackable: true, count: randomInt(1, 3) });
    items.push({ type: 'food', name: 'MRE', healAmount: 20, hungerRestore: 40, stackable: true, count: randomInt(1, 2) });
    items.push({ type: 'water', name: 'Purified Water', thirstRestore: 50, stackable: true, count: randomInt(1, 2) });
    items.push({ type: 'ammo', name: 'Ammo Pack', ammoType: 'rifle', ammoAmount: randomInt(20, 60) });
    
    // Maybe armor
    if (Math.random() < 0.4) {
      items.push({ type: 'armor', name: 'Tactical Armor', protection: 0.45, durability: 70, maxDurability: 70 });
    }
    
    return items;
  }

  interact(drop) {
    if (drop.status !== 'landed') return null;
    drop.status = 'looted';
    this.active = false;
    return drop.loot;
  }
}

// ============================================================
// CRAFTING SYSTEM
// ============================================================
const CRAFTING_RECIPES = {
  bandage: {
    name: 'Bandage',
    result: { type: 'medical', name: 'Bandage', healAmount: 15, stackable: true, count: 1 },
    materials: [{ name: 'Scrap', count: 2 }],
  },
  med_kit: {
    name: 'Medical Kit',
    result: { type: 'medical', name: 'Med Kit', healAmount: 40, stackable: true, count: 1 },
    materials: [{ name: 'Scrap', count: 3 }, { name: 'Bandage', count: 2 }],
  },
  ammo_pouch: {
    name: 'Ammo Pouch',
    result: { type: 'ammo_pouch', name: 'Ammo Pouch', capacityBonus: 10 },
    materials: [{ name: 'Scrap', count: 4 }],
  },
  barricade: {
    name: 'Barricade',
    result: { type: 'placeable', name: 'Barricade', hp: 100 },
    materials: [{ name: 'Scrap Metal', count: 3 }],
  },
  repair_kit: {
    name: 'Repair Kit',
    result: { type: 'repair', name: 'Repair Kit', repairAmount: 30, stackable: true, count: 1 },
    materials: [{ name: 'Scrap Metal', count: 2 }, { name: 'Electronics', count: 1 }],
  },
  improvised_weapon: {
    name: 'Improvised Melee',
    result: { type: 'weapon', weapon: { ...WEAPONS.baseball_bat }, name: 'Baseball Bat' },
    materials: [{ name: 'Scrap', count: 3 }],
  },
};

function canCraft(recipe, inventory) {
  for (const mat of recipe.materials) {
    const invItem = inventory.find(i => i.name === mat.name);
    if (!invItem || (invItem.count || 1) < mat.count) return false;
  }
  return true;
}

function craft(recipe, inventory) {
  if (!canCraft(recipe, inventory)) return false;
  for (const mat of recipe.materials) {
    const invItem = inventory.find(i => i.name === mat.name);
    if (invItem) {
      invItem.count = (invItem.count || 1) - mat.count;
      if (invItem.count <= 0) {
        const idx = inventory.indexOf(invItem);
        inventory.splice(idx, 1);
      }
    }
  }
  return { ...recipe.result };
}

// ============================================================
// SAVE SYSTEM
// ============================================================
class SaveSystem {
  static SAVE_KEY = 'lastsignal_save';
  
  static save(gameState) {
    try {
      const data = {
        version: 1,
        timestamp: Date.now(),
        player: {
          role: gameState.player.role,
          x: gameState.player.x,
          y: gameState.player.y,
          hp: gameState.player.hp,
          maxHP: gameState.player.maxHP,
          hunger: gameState.player.hunger,
          thirst: gameState.player.thirst,
          stamina: gameState.player.stamina,
          level: gameState.player.level,
          xp: gameState.player.xp,
          xpToNextLevel: gameState.player.xpToNextLevel,
          weapons: gameState.player.weapons.map(w => ({ ...w })),
          currentWeaponIdx: gameState.player.currentWeaponIdx,
          ammo: { ...gameState.player.ammo },
          armor: gameState.player.armor ? { ...gameState.player.armor } : null,
          armorDurability: gameState.player.armorDurability,
          inventory: gameState.player.inventory.map(i => ({ ...i })),
          stats: { ...gameState.player.stats },
          activeQuests: gameState.player.activeQuests.map(q => ({ ...q })),
          completedQuests: [...gameState.player.completedQuests],
        },
        worldSeed: gameState.worldSeed,
        gameTime: gameState.gameTime,
        dayTime: gameState.dayTime,
        defeatedBosses: gameState.zombies.filter(z => z.isBoss && z.hp <= 0).map(z => z.id),
      };
      localStorage.setItem(SaveSystem.SAVE_KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      console.error('Save failed:', e);
      return false;
    }
  }

  static load() {
    try {
      const raw = localStorage.getItem(SaveSystem.SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || data.version !== 1) return null;
      return data;
    } catch (e) {
      console.error('Load failed:', e);
      return null;
    }
  }

  static hasSave() {
    return !!localStorage.getItem(SaveSystem.SAVE_KEY);
  }

  static deleteSave() {
    localStorage.removeItem(SaveSystem.SAVE_KEY);
  }
}

// ============================================================
// NOTIFICATION SYSTEM
// ============================================================
class NotificationSystem {
  constructor() {
    this.notifications = [];
  }

  add(text, type = 'info', duration = 3) {
    this.notifications.push({ text, type, duration, timer: duration });
  }

  update(dt) {
    for (let i = this.notifications.length - 1; i >= 0; i--) {
      this.notifications[i].timer -= dt;
      if (this.notifications[i].timer <= 0) {
        this.notifications.splice(i, 1);
      }
    }
  }

  render(ctx, canvasW) {
    for (let i = 0; i < this.notifications.length; i++) {
      const n = this.notifications[i];
      const alpha = Math.min(1, n.timer / 0.5);
      const y = 80 + i * 35;
      ctx.globalAlpha = alpha;
      
      const colors = {
        info: '#55aaff',
        warning: '#ffaa00',
        danger: '#ff4444',
        success: '#44ff44',
        loot: '#ffcc00',
        quest: '#aa55ff',
      };
      
      ctx.fillStyle = colors[n.type] || colors.info;
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(n.text, canvasW / 2, y);
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = 'left';
  }
}

// ============================================================
// MINIMAP
// ============================================================
function renderMinimap(ctx, player, world, camera, entities, canvasW) {
  const size = 160;
  const margin = 10;
  const x = canvasW - size - margin;
  const y = margin;
  const scale = size / (40 * TILE_SIZE); // Show 40x40 tile area
  
  // Background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(x, y, size, size);
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, size, size);
  
  const centerTX = Math.floor(player.x / TILE_SIZE);
  const centerTY = Math.floor(player.y / TILE_SIZE);
  const viewRadius = 20; // tiles visible on minimap
  
  // Draw tiles
  for (let ty = centerTY - viewRadius; ty <= centerTY + viewRadius; ty++) {
    for (let tx = centerTX - viewRadius; tx <= centerTX + viewRadius; tx++) {
      if (tx < 0 || tx >= WORLD_TILES_X || ty < 0 || ty >= WORLD_TILES_Y) continue;
      const tile = world.tiles[ty][tx];
      let color;
      switch (tile) {
        case TILE.ROAD: color = '#333'; break;
        case TILE.WALL: color = '#666'; break;
        case TILE.FLOOR: color = '#444'; break;
        case TILE.DOOR: color = '#864'; break;
        case TILE.SAFEHOUSE: color = '#264'; break;
        default: continue; // don't draw grass on minimap
      }
      const mx = x + (tx - centerTX + viewRadius) * (size / (viewRadius * 2));
      const my = y + (ty - centerTY + viewRadius) * (size / (viewRadius * 2));
      const ms = size / (viewRadius * 2) + 0.5;
      ctx.fillStyle = color;
      ctx.fillRect(mx, my, ms, ms);
    }
  }
  
  // Draw zombies as red dots
  ctx.fillStyle = '#ff3333';
  for (const z of entities.zombies) {
    if (z.hp <= 0) continue;
    const zx = x + ((z.x / TILE_SIZE - centerTX) + viewRadius) * (size / (viewRadius * 2));
    const zy = y + ((z.y / TILE_SIZE - centerTY) + viewRadius) * (size / (viewRadius * 2));
    if (zx >= x && zx <= x + size && zy >= y && zy <= y + size) {
      ctx.fillRect(zx - 1, zy - 1, z.isBoss ? 4 : 2, z.isBoss ? 4 : 2);
    }
  }
  
  // Draw NPCs as blue/green dots
  for (const npc of entities.npcs) {
    if (!npc.alive) continue;
    const nx = x + ((npc.x / TILE_SIZE - centerTX) + viewRadius) * (size / (viewRadius * 2));
    const ny = y + ((npc.y / TILE_SIZE - centerTY) + viewRadius) * (size / (viewRadius * 2));
    if (nx >= x && nx <= x + size && ny >= y && ny <= y + size) {
      ctx.fillStyle = npc.hostile ? '#ff8800' : '#44aaff';
      ctx.fillRect(nx - 1, ny - 1, 3, 3);
    }
  }
  
  // Draw airdrops
  ctx.fillStyle = '#ffff00';
  for (const drop of entities.airdropSystem.airdrops) {
    if (drop.status === 'landed') {
      const dx = x + ((drop.x / TILE_SIZE - centerTX) + viewRadius) * (size / (viewRadius * 2));
      const dy = y + ((drop.y / TILE_SIZE - centerTY) + viewRadius) * (size / (viewRadius * 2));
      if (dx >= x && dx <= x + size && dy >= y && dy <= y + size) {
        ctx.fillRect(dx - 2, dy - 2, 4, 4);
      }
    }
  }
  
  // Draw player (center)
  ctx.fillStyle = '#00ff00';
  const px = x + size / 2;
  const py = y + size / 2;
  ctx.fillRect(px - 2, py - 2, 4, 4);
  
  // Player direction indicator
  ctx.strokeStyle = '#00ff00';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(px + Math.cos(player.angle) * 8, py + Math.sin(player.angle) * 8);
  ctx.stroke();
}

// ============================================================
// MAIN GAME CLASS
// ============================================================
export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = canvas.width;
    this.height = canvas.height;

    // Core systems
    this.input = new InputManager(canvas);
    this.camera = new Camera(this.width, this.height);
    this.audio = new AudioSystem();
    this.particles = new ParticleSystem();
    this.notifications = new NotificationSystem();
    this.lootSystem = new LootSystem();
    this.collision = null;
    this.airdropSystem = null;

    // Game state
    this.state = 'menu'; // menu, playing, paused, inventory, map, quest, dialog, crafting, charselect, dead, settings, charstats
    this.player = null;
    this.world = null;
    this.worldSeed = 0;
    this.gameTime = 0; // seconds played
    this.dayTime = 0.25; // 0-1 cycle, start at morning

    // Entities
    this.entities = {
      zombies: [],
      npcs: [],
      projectiles: [],
      airdropSystem: null,
    };

    // Spawning
    this.zombieSpawnTimer = 0;
    this.maxZombies = 80;
    this.spawnRadius = 600;

    // UI state
    this.dialogState = null;
    this.selectedInventorySlot = -1;
    this.showControls = false;
    this.settingsTab = 'general';
    this.tradeItems = null;
    this.selectedTradeItem = -1;
    this.selectedCraftRecipe = null;
    this.charSelectRole = null;
    
    // Performance
    this.fps = 0;
    this.frameCount = 0;
    this.fpsTimer = 0;
    this.lastTime = 0;
    this.running = false;

    // Autosave
    this.autosaveTimer = 0;
    this.autosaveInterval = 60; // Save every 60 seconds

    // Key tracking for single-press
    this.prevKeys = {};

    // Touch support
    this.touchState = {
      joystick: { active: false, startX: 0, startY: 0, currentX: 0, currentY: 0, dx: 0, dy: 0 },
      aimTouch: { active: false, x: 0, y: 0 },
      buttons: {},
    };
    this.setupTouch();
  }

  setupTouch() {
    // Virtual joystick for mobile
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      for (const touch of e.changedTouches) {
        const rect = this.canvas.getBoundingClientRect();
        const tx = touch.clientX - rect.left;
        const ty = touch.clientY - rect.top;
        
        if (tx < this.width / 2) {
          // Left side = joystick
          this.touchState.joystick.active = true;
          this.touchState.joystick.startX = tx;
          this.touchState.joystick.startY = ty;
          this.touchState.joystick.currentX = tx;
          this.touchState.joystick.currentY = ty;
          this.touchState.joystick.id = touch.identifier;
        } else {
          // Right side = aim/shoot
          this.touchState.aimTouch.active = true;
          this.touchState.aimTouch.x = tx;
          this.touchState.aimTouch.y = ty;
          this.touchState.aimTouch.id = touch.identifier;
          this.input.mouse.x = tx;
          this.input.mouse.y = ty;
          this.input.mouse.left = true;
        }
      }
    });

    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const touch of e.changedTouches) {
        const rect = this.canvas.getBoundingClientRect();
        const tx = touch.clientX - rect.left;
        const ty = touch.clientY - rect.top;
        
        if (touch.identifier === this.touchState.joystick.id) {
          this.touchState.joystick.currentX = tx;
          this.touchState.joystick.currentY = ty;
          const dx = tx - this.touchState.joystick.startX;
          const dy = ty - this.touchState.joystick.startY;
          const len = Math.sqrt(dx * dx + dy * dy);
          const maxLen = 50;
          if (len > maxLen) {
            this.touchState.joystick.dx = (dx / len) * maxLen;
            this.touchState.joystick.dy = (dy / len) * maxLen;
          } else {
            this.touchState.joystick.dx = dx;
            this.touchState.joystick.dy = dy;
          }
        }
        if (touch.identifier === this.touchState.aimTouch.id) {
          this.touchState.aimTouch.x = tx;
          this.touchState.aimTouch.y = ty;
          this.input.mouse.x = tx;
          this.input.mouse.y = ty;
        }
      }
    });

    const endTouch = (e) => {
      for (const touch of e.changedTouches) {
        if (touch.identifier === this.touchState.joystick.id) {
          this.touchState.joystick.active = false;
          this.touchState.joystick.dx = 0;
          this.touchState.joystick.dy = 0;
        }
        if (touch.identifier === this.touchState.aimTouch.id) {
          this.touchState.aimTouch.active = false;
          this.input.mouse.left = false;
        }
      }
    };
    this.canvas.addEventListener('touchend', endTouch);
    this.canvas.addEventListener('touchcancel', endTouch);
  }

  // ============================================================
  // INITIALIZATION
  // ============================================================
  init() {
    this.audio.init();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.lastTime = performance.now();
    this.running = true;
    this.loop(this.lastTime);
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.width = this.canvas.width;
    this.height = this.canvas.height;
    this.camera.resize(this.width, this.height);
  }

  startNewGame(role) {
    this.worldSeed = Math.floor(Math.random() * 999999);
    const generator = new WorldGenerator(this.worldSeed);
    this.world = generator.generate();
    this.collision = new CollisionSystem(this.world);

    // Find a safe spawn point
    const safehouse = this.world.safehouses[0];
    const spawnX = safehouse ? safehouse.x : WORLD_WIDTH / 2;
    const spawnY = safehouse ? safehouse.y : WORLD_HEIGHT / 2;

    this.player = new Player(role, spawnX, spawnY);
    
    // Give starting equipment
    this.player.weapons.push({ ...WEAPONS.combat_knife });
    this.player.weapons.push({ ...WEAPONS.pistol });
    this.player.ammo = { pistol: 24, smg: 0, rifle: 0, shotgun: 0, sniper: 0, revolver: 0, lmg: 0, crossbow: 0, grenade: 0, rocket: 0 };
    this.player.inventory = [
      { type: 'food', name: 'Canned Food', healAmount: 15, hungerRestore: 25, stackable: true, count: 3 },
      { type: 'water', name: 'Water Bottle', thirstRestore: 30, stackable: true, count: 2 },
      { type: 'medical', name: 'Bandage', healAmount: 15, stackable: true, count: 2 },
      { type: 'material', name: 'Scrap', stackable: true, count: 5 },
    ];

    // Initialize entities
    this.entities.zombies = [];
    this.entities.npcs = [];
    this.entities.projectiles = [];
    
    this.airdropSystem = new AirdropSystem(this.world);
    this.entities.airdropSystem = this.airdropSystem;

    // Spawn initial zombies
    for (const sp of this.world.spawnPoints) {
      const d = dist(sp.x, sp.y, spawnX, spawnY);
      if (d > 300 && d < 1500) {
        const zombie = new Zombie(sp.type, sp.x, sp.y);
        this.entities.zombies.push(zombie);
      }
    }
    // Limit initial count
    if (this.entities.zombies.length > 50) {
      this.entities.zombies.length = 50;
    }

    // Spawn bosses
    for (const bs of this.world.bossSpawns) {
      if (!bs.defeated) {
        const boss = new Zombie('walker', bs.x, bs.y); // base type
        const bossData = BOSS_TYPES[bs.bossType];
        boss.isBoss = true;
        boss.bossData = bossData;
        boss.data = bossData;
        boss.hp = bossData.hp;
        boss.maxHp = bossData.hp;
        boss.damage = bossData.damage;
        boss.moveSpeed = bossData.moveSpeed;
        boss.detectionRange = bossData.detectionRange;
        boss.attackRange = bossData.attackRange;
        boss.attackCooldown = bossData.attackCooldown;
        boss.resistance = bossData.resistance;
        boss.radius = bossData.size;
        boss.xpReward = bossData.xpReward;
        boss.lootChance = 1.0;
        boss.bossAttackTimers = {};
        boss.state = ZOMBIE_STATES.IDLE;
        this.entities.zombies.push(boss);
      }
    }

    // Spawn NPCs
    for (const ns of this.world.npcSpawns) {
      const npc = new NPC(ns);
      this.entities.npcs.push(npc);
    }

    // Give a quest
    this.player.activeQuests.push({
      id: 'intro_quest',
      name: 'Survive the Dead Zone',
      description: 'Eliminate 10 zombies to prove your worth.',
      type: 'kill',
      target: 10,
      progress: 0,
      reward: { xp: 100, items: [{ type: 'medical', name: 'Med Kit', healAmount: 40, stackable: true, count: 2 }] },
      completed: false,
    });

    this.gameTime = 0;
    this.dayTime = 0.25; // morning
    this.state = 'playing';
    this.notifications.add('Welcome to LAST SIGNAL: DEAD ZONE', 'info', 4);
    this.notifications.add('WASD to move, Mouse to aim, Click to shoot', 'info', 5);
  }

  continueGame(saveData) {
    // Regenerate world from seed
    this.worldSeed = saveData.worldSeed;
    const generator = new WorldGenerator(this.worldSeed);
    this.world = generator.generate();
    this.collision = new CollisionSystem(this.world);

    // Restore player
    const pd = saveData.player;
    this.player = new Player(pd.role, pd.x, pd.y);
    Object.assign(this.player, {
      hp: pd.hp, maxHP: pd.maxHP, hunger: pd.hunger, thirst: pd.thirst,
      stamina: pd.stamina, level: pd.level, xp: pd.xp, xpToNextLevel: pd.xpToNextLevel,
      weapons: pd.weapons, currentWeaponIdx: pd.currentWeaponIdx,
      ammo: pd.ammo, armor: pd.armor, armorDurability: pd.armorDurability,
      inventory: pd.inventory, stats: pd.stats || this.player.stats,
      activeQuests: pd.activeQuests || [], completedQuests: pd.completedQuests || [],
    });

    // Restore entities
    this.entities.zombies = [];
    this.entities.npcs = [];
    this.entities.projectiles = [];
    this.airdropSystem = new AirdropSystem(this.world);
    this.entities.airdropSystem = this.airdropSystem;

    // Respawn zombies
    for (const sp of this.world.spawnPoints) {
      if (this.entities.zombies.length < 40) {
        const zombie = new Zombie(sp.type, sp.x, sp.y);
        this.entities.zombies.push(zombie);
      }
    }

    // Respawn bosses (check defeated)
    for (const bs of this.world.bossSpawns) {
      const defeated = saveData.defeatedBosses && saveData.defeatedBosses.includes(bs.bossType);
      if (!defeated) {
        const boss = new Zombie('walker', bs.x, bs.y);
        const bossData = BOSS_TYPES[bs.bossType];
        boss.isBoss = true;
        boss.bossData = bossData;
        boss.data = bossData;
        boss.hp = bossData.hp;
        boss.maxHp = bossData.hp;
        boss.damage = bossData.damage;
        boss.moveSpeed = bossData.moveSpeed;
        boss.detectionRange = bossData.detectionRange;
        boss.attackRange = bossData.attackRange;
        boss.attackCooldown = bossData.attackCooldown;
        boss.resistance = bossData.resistance;
        boss.radius = bossData.size;
        boss.xpReward = bossData.xpReward;
        boss.lootChance = 1.0;
        boss.bossAttackTimers = {};
        this.entities.zombies.push(boss);
      }
    }

    // Respawn NPCs
    for (const ns of this.world.npcSpawns) {
      this.entities.npcs.push(new NPC(ns));
    }

    this.gameTime = saveData.gameTime || 0;
    this.dayTime = saveData.dayTime || 0.25;
    this.state = 'playing';
    this.notifications.add('Game loaded successfully', 'success');
  }

  // ============================================================
  // GAME LOOP
  // ============================================================
  loop(time) {
    if (!this.running) return;
    requestAnimationFrame((t) => this.loop(t));

    const dt = Math.min((time - this.lastTime) / 1000, 0.05); // cap delta time
    this.lastTime = time;

    // FPS counter
    this.frameCount++;
    this.fpsTimer += dt;
    if (this.fpsTimer >= 1) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.fpsTimer = 0;
    }

    // Track previous key state for single-press detection
    this._prevKeysSnapshot = { ...(this._prevKeysSnapshot || {}) };
    this.update(dt);
    this._prevKeysSnapshot = { ...this.input.keys };
    this.render();
  }

  // ============================================================
  // UPDATE
  // ============================================================
  update(dt) {
    switch (this.state) {
      case 'menu':
        this.updateMenu(dt);
        break;
      case 'charselect':
        this.updateCharSelect(dt);
        break;
      case 'playing':
        this.updatePlaying(dt);
        break;
      case 'paused':
      case 'inventory':
      case 'map':
      case 'quest':
      case 'dialog':
      case 'crafting':
      case 'charstats':
      case 'settings':
        this.updateOverlay(dt);
        break;
      case 'dead':
        this.updateDead(dt);
        break;
    }
  }

  justPressed(code) {
    const current = !!this.input.keys[code];
    const prev = !!(this._prevKeysSnapshot && this._prevKeysSnapshot[code]);
    return current && !prev;
  }

  updateMenu(dt) {
    // Menu is handled via click events in render
  }

  updateCharSelect(dt) {
    // Handled via click events
  }

  updateOverlay(dt) {
    if (this.justPressed('Escape')) {
      this.state = 'playing';
    }
    if (this.justPressed('Tab') && this.state === 'inventory') {
      this.state = 'playing';
    }
    if (this.justPressed('KeyM') && this.state === 'map') {
      this.state = 'playing';
    }
  }

  updateDead(dt) {
    // Death screen - handled via click
  }

  updatePlaying(dt) {
    this.input.update(this.camera);
    this.gameTime += dt;

    // Day/night cycle
    this.dayTime = (this.gameTime / DAY_DURATION) % 1;
    const isNight = this.dayTime > NIGHT_START || this.dayTime < NIGHT_END;

    // Check menu keys
    if (this.justPressed('Escape')) { this.state = 'paused'; return; }
    if (this.justPressed('Tab')) { this.state = 'inventory'; this.selectedInventorySlot = -1; return; }
    if (this.justPressed('KeyM')) { this.state = 'map'; return; }
    if (this.justPressed('KeyJ')) { this.state = 'quest'; return; }
    if (this.justPressed('KeyC')) { this.state = 'charstats'; return; }
    if (this.justPressed('KeyB')) { this.state = 'crafting'; this.selectedCraftRecipe = null; return; }

    const player = this.player;
    if (!player.alive) { this.state = 'dead'; return; }

    // === PLAYER MOVEMENT ===
    let moveX = 0, moveY = 0;
    if (this.input.isDown('KeyW') || this.input.isDown('ArrowUp')) moveY = -1;
    if (this.input.isDown('KeyS') || this.input.isDown('ArrowDown')) moveY = 1;
    if (this.input.isDown('KeyA') || this.input.isDown('ArrowLeft')) moveX = -1;
    if (this.input.isDown('KeyD') || this.input.isDown('ArrowRight')) moveX = 1;

    // Touch joystick
    if (this.touchState.joystick.active) {
      const joyMag = Math.sqrt(this.touchState.joystick.dx ** 2 + this.touchState.joystick.dy ** 2);
      if (joyMag > 10) {
        moveX = this.touchState.joystick.dx / 50;
        moveY = this.touchState.joystick.dy / 50;
      }
    }

    // Normalize
    const moveLen = Math.sqrt(moveX * moveX + moveY * moveY);
    if (moveLen > 0) {
      moveX /= moveLen;
      moveY /= moveLen;
    }

    // Sprint
    player.sprinting = this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight');
    if (player.sprinting && player.stamina <= 0) player.sprinting = false;
    if (player.sprinting && moveLen > 0) {
      player.stamina = Math.max(0, player.stamina - player.staminaDrain * dt);
    } else {
      player.stamina = Math.min(player.staminaMax, player.stamina + player.staminaRegen * dt);
    }

    const speed = player.getEffectiveSpeed();
    if (moveLen > 0) {
      const newX = player.x + moveX * speed * dt;
      const newY = player.y + moveY * speed * dt;
      const resolved = this.collision.resolveCircleVsTiles(newX, newY, player.radius);
      player.stats.distanceTraveled += dist(player.x, player.y, resolved.x, resolved.y);
      player.x = resolved.x;
      player.y = resolved.y;
    }

    // Player aim
    player.angle = angle(player.x, player.y, this.input.mouse.worldX, this.input.mouse.worldY);

    // === WEAPON SWITCH ===
    for (let i = 1; i <= 5; i++) {
      if (this.justPressed('Digit' + i) && i - 1 < player.weapons.length) {
        player.currentWeaponIdx = i - 1;
      }
    }

    // === SHOOTING / ATTACKING ===
    const weapon = player.getWeapon();
    if (weapon) {
      // Initialize magazine for ranged weapons
      if (weapon.type !== WEAPON_TYPES.MELEE && weapon.currentMagazine === undefined) {
        weapon.currentMagazine = weapon.magazineSize;
      }
      
      if (weapon.type === WEAPON_TYPES.MELEE) {
        // Melee attack
        if (this.input.mouse.leftDown || (this.input.mouse.left && weapon.attackRate > 3)) {
          if (!weapon._cooldown || weapon._cooldown <= 0) {
            weapon._cooldown = 1 / weapon.attackRate;
            this.performMeleeAttack(player, weapon);
          }
        }
        if (weapon._cooldown) {
          weapon._cooldown = Math.max(0, weapon._cooldown - dt);
        }
      } else {
        // Ranged attack
        if (this.input.mouse.left) {
          if (!weapon._cooldown || weapon._cooldown <= 0) {
            weapon._cooldown = 1 / weapon.fireRate;
            this.performRangedAttack(player, weapon);
          }
        }
        if (weapon._cooldown) {
          weapon._cooldown = Math.max(0, weapon._cooldown - dt);
        }
      }
    }

    // === RELOAD ===
    if (this.justPressed('KeyR') && weapon && weapon.type !== WEAPON_TYPES.MELEE) {
      this.performReload(player, weapon);
    }

    // === INTERACT ===
    if (this.justPressed('KeyE') || this.justPressed('KeyF')) {
      this.handleInteraction();
    }

    // === SKILL ===
    if (this.justPressed('KeyQ')) {
      this.activateSkill();
    }

    // === SURVIVAL ===
    player.hunger = Math.max(0, player.hunger - player.hungerRate * dt);
    player.thirst = Math.max(0, player.thirst - player.thirstRate * dt);
    
    // Starvation/dehydration damage
    if (player.hunger <= 0 || player.thirst <= 0) {
      player.takeDamage(2 * dt, 'environment');
    }
    
    // Bleeding
    if (player.bleeding > 0) {
      player.hp -= player.bleeding * dt;
      player.bleeding = Math.max(0, player.bleeding - 0.5 * dt);
    }
    
    // Infection
    if (player.infection > 0) {
      player.hp -= player.infection * 0.5 * dt;
      player.infection = Math.max(0, player.infection - 0.1 * dt);
    }

    // Role skill timers
    if (player.firstBloodActive) {
      player.firstBloodTimer -= dt;
      if (player.firstBloodTimer <= 0) {
        player.firstBloodActive = false;
      }
    }
    if (player.killSpeedPenaltyTimer > 0) {
      player.killSpeedPenaltyTimer -= dt;
    }
    if (player.suppressiveFireActive) {
      player.suppressiveFireTimer -= dt;
      if (player.suppressiveFireTimer <= 0) {
        player.suppressiveFireActive = false;
      }
    }
    if (player.skillCooldown > 0) {
      player.skillCooldown -= dt;
    }
    if (player.berserkTimer > 0) {
      player.berserkTimer -= dt;
    }

    // === UPDATE ENTITIES ===
    this.updateZombies(dt);
    this.updateNPCs(dt);
    this.updateProjectiles(dt);
    this.airdropSystem.update(dt, player);
    this.particles.update(dt);
    this.notifications.update(dt);
    this.lootSystem.droppedItems = this.lootSystem.droppedItems.filter(item => {
      return dist(item.x, item.y, player.x, player.y) < 1000;
    });

    // === ZOMBIE SPAWNING ===
    this.zombieSpawnTimer += dt;
    if (this.zombieSpawnTimer >= 5 && this.entities.zombies.filter(z => z.hp > 0).length < this.maxZombies) {
      this.zombieSpawnTimer = 0;
      this.spawnZombie();
    }

    // === CHECK NEARBY OBJECTS ===
    this.checkNearbyObjects();

    // === CAMERA ===
    this.camera.follow(player, dt);
    this.camera.update(dt);

    // === AUTOSAVE ===
    this.autosaveTimer += dt;
    if (this.autosaveTimer >= this.autosaveInterval) {
      this.autosaveTimer = 0;
      SaveSystem.save({
        player: this.player,
        worldSeed: this.worldSeed,
        gameTime: this.gameTime,
        dayTime: this.dayTime,
        zombies: this.entities.zombies,
      });
      this.notifications.add('Game autosaved', 'info', 2);
    }

    // === CHECK WIN/LOSE ===
    // Player death check is at the top
  }

  // ============================================================
  // COMBAT ACTIONS
  // ============================================================
  performMeleeAttack(player, weapon) {
    this.audio.playSound('melee');
    const mods = player.getDamageModifiers();
    let damage = weapon.baseDamage * mods.mult + mods.flat;
    
    // Soldier reload bonus applies to melee? No, just ranged
    // Hacker melee bonus already in getDamageModifiers
    
    const range = weapon.range + player.radius;
    const arc = weapon.arcAngle || (Math.PI / 3);
    
    // Find enemies in arc
    let hitAny = false;
    for (const zombie of this.entities.zombies) {
      if (zombie.hp <= 0) continue;
      const d = dist(player.x, player.y, zombie.x, zombie.y);
      if (d > range + zombie.radius) continue;
      
      const aToZ = angle(player.x, player.y, zombie.x, zombie.y);
      let angleDiff = Math.abs(aToZ - player.angle);
      if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
      
      if (angleDiff <= arc / 2 || weapon.penetration) {
        const effectiveDmg = zombie.takeDamage(damage);
        player.stats.damageDealt += effectiveDmg;
        hitAny = true;
        
        // Knockback
        const kb = weapon.knockback || 5;
        const kbAngle = angle(player.x, player.y, zombie.x, zombie.y);
        zombie.x += Math.cos(kbAngle) * kb;
        zombie.y += Math.sin(kbAngle) * kb;
        
        // Particles
        this.particles.emit(zombie.x, zombie.y, 5, { color: '#88ff44', speed: 80, life: 0.3 });
        
        // Lifesteal (Hacker)
        if (player.role === 'hacker' && player.roleData.bonuses.meleeLifesteal > 0) {
          const heal = effectiveDmg * player.roleData.bonuses.meleeLifesteal;
          player.heal(heal);
        }
        
        // Stun (sledgehammer)
        if (weapon.stunChance && Math.random() < weapon.stunChance) {
          zombie.stunTimer = weapon.stunDuration || 1;
        }
        
        // Kill check
        if (zombie.hp <= 0) {
          this.onZombieKilled(zombie, player);
        }

        if (!weapon.penetration) break; // only hit first target unless penetrating
      }
    }

    // Check NPC melee (hostile only)
    for (const npc of this.entities.npcs) {
      if (!npc.alive) continue;
      const d = dist(player.x, player.y, npc.x, npc.y);
      if (d > range + npc.radius) continue;
      const aToN = angle(player.x, player.y, npc.x, npc.y);
      let angleDiff = Math.abs(aToN - player.angle);
      if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
      if (angleDiff <= arc / 2) {
        npc.takeDamage(damage);
        this.particles.emit(npc.x, npc.y, 5, { color: '#ff4444', speed: 80, life: 0.3 });
        if (!npc.alive) {
          this.notifications.add(`${npc.name} has been killed`, 'danger');
        }
        break;
      }
    }

    // Melee swing visual
    this.particles.emit(
      player.x + Math.cos(player.angle) * 20,
      player.y + Math.sin(player.angle) * 20,
      3, { color: '#ffffff', speed: 60, life: 0.15, size: 4 }
    );
  }

  performRangedAttack(player, weapon) {
    // Check ammo
    const ammoType = weapon.ammoType;
    if (weapon.currentMagazine !== undefined && weapon.currentMagazine <= 0) {
      // Auto reload
      this.performReload(player, weapon);
      return;
    }
    if (weapon.currentMagazine === undefined) {
      weapon.currentMagazine = weapon.magazineSize;
    }
    if (weapon.currentMagazine <= 0) return;

    weapon.currentMagazine--;
    
    // Sound
    if (weapon.id === 'shotgun') {
      this.audio.playSound('shotgun');
    } else {
      this.audio.playSound('shoot');
    }
    
    // Camera shake
    this.camera.addShake(weapon.recoil * 50);

    const mods = player.getDamageModifiers();
    let damage = weapon.baseDamage * mods.mult + mods.flat;

    // Soldier bonuses
    let spread = weapon.spread;
    if (player.suppressiveFireActive) {
      spread *= (1 - player.roleData.skill.spreadReduction);
    }

    const pellets = weapon.pelletCount || 1;
    
    for (let i = 0; i < pellets; i++) {
      const spreadAngle = player.angle + (Math.random() - 0.5) * spread;
      const proj = new Projectile(
        player.x + Math.cos(player.angle) * 20,
        player.y + Math.sin(player.angle) * 20,
        spreadAngle,
        weapon.projectileSpeed,
        damage,
        weapon.range,
        'player',
        {
          explosive: weapon.explosive,
          explosionRadius: weapon.explosionRadius || 0,
          radius: weapon.explosive ? 5 : 3,
          color: weapon.explosive ? '#ff8800' : '#ffff44',
        }
      );
      this.entities.projectiles.push(proj);
    }

    // Muzzle flash
    this.particles.emit(
      player.x + Math.cos(player.angle) * 22,
      player.y + Math.sin(player.angle) * 22,
      3, { color: '#ffaa00', speed: 100, life: 0.1, size: 4 }
    );

    // Update ammo reserve
    if (weapon.currentMagazine <= 0) {
      this.performReload(player, weapon);
    }
  }

  performReload(player, weapon) {
    if (!weapon || weapon.type === WEAPON_TYPES.MELEE) return;
    if (weapon.currentMagazine >= weapon.magazineSize) return;

    const ammoType = weapon.ammoType;
    const available = player.ammo[ammoType] || 0;
    if (available <= 0) {
      this.notifications.add('No ammo!', 'warning');
      return;
    }

    const needed = weapon.magazineSize - (weapon.currentMagazine || 0);
    const toLoad = Math.min(needed, available);
    
    // Apply reload speed modifiers
    let reloadTime = weapon.reloadTime;
    if (player.role === 'soldier') {
      reloadTime *= (1 - player.roleData.bonuses.reloadSpeed);
      if (player.suppressiveFireActive) {
        reloadTime *= (1 - player.roleData.skill.reloadBonus);
      }
    }

    weapon.currentMagazine = (weapon.currentMagazine || 0) + toLoad;
    player.ammo[ammoType] = available - toLoad;
    this.audio.playSound('reload');
    this.notifications.add('Reloaded', 'info', 1);
  }

  onZombieKilled(zombie, player) {
    player.stats.kills++;
    player.addXP(zombie.xpReward);
    this.lootSystem.dropZombieLoot(zombie);
    
    if (zombie.isBoss) {
      player.stats.bossKills++;
      this.lootSystem.dropBossLoot(zombie);
      this.notifications.add(`BOSS DEFEATED: ${zombie.bossData.name}!`, 'success', 5);
      this.audio.playSound('levelup');
    }

    this.audio.playSound('death');
    this.particles.emit(zombie.x, zombie.y, 15, { color: '#88aa44', speed: 120, life: 0.5 });

    // Quest progress
    for (const quest of player.activeQuests) {
      if (quest.type === 'kill' && !quest.completed) {
        quest.progress++;
        if (quest.progress >= quest.target) {
          quest.completed = true;
          player.xp += quest.reward.xp;
          this.notifications.add(`Quest Complete: ${quest.name}!`, 'quest', 4);
          this.audio.playSound('levelup');
          // Give reward items
          if (quest.reward.items) {
            for (const item of quest.reward.items) {
              player.inventory.push({ ...item });
            }
          }
        }
      }
      if (quest.type === 'boss' && zombie.isBoss && !quest.completed) {
        quest.progress++;
        if (quest.progress >= quest.target) {
          quest.completed = true;
          player.xp += quest.reward.xp;
          this.notifications.add(`Quest Complete: ${quest.name}!`, 'quest', 5);
        }
      }
    }

    // Killer First Blood trigger
    if (player.role === 'killer' && !player.firstBloodActive) {
      if (Math.random() < player.roleData.skill.triggerChance) {
        player.firstBloodActive = true;
        player.firstBloodTimer = player.roleData.skill.duration;
        this.notifications.add('FIRST BLOOD ACTIVATED!', 'danger', 3);
        this.audio.playSound('skill');
      }
    }

    // Killer kill speed penalty
    if (player.role === 'killer' && !player.firstBloodActive) {
      player.killSpeedPenaltyTimer = player.roleData.weaknesses.killSpeedPenaltyDuration;
    }
  }

  activateSkill() {
    const player = this.player;
    if (player.skillCooldown > 0) {
      this.notifications.add('Skill on cooldown', 'warning', 1);
      return;
    }

    switch (player.role) {
      case 'hacker':
        // Hack nearest robotic enemy
        let closest = null;
        let closestDist = 200;
        for (const z of this.entities.zombies) {
          if (z.hp <= 0) continue;
          if (z.type !== 'armored' && z.type !== 'elite' && !z.isBoss) continue;
          const d = dist(player.x, player.y, z.x, z.y);
          if (d < closestDist) {
            closest = z;
            closestDist = d;
          }
        }
        if (closest) {
          const chance = closest.isBoss ? 0.2 : (closest.type === 'elite' ? 0.35 : player.roleData.bonuses.hackSuccessRate);
          if (Math.random() < chance) {
            // Hack success - make it fight for us temporarily
            closest._hacked = true;
            closest._hackTimer = player.roleData.skill.duration;
            closest.aggroTarget = null;
            this.notifications.add('HACK SUCCESSFUL! Unit allied.', 'success', 3);
            this.audio.playSound('skill');
          } else {
            this.notifications.add('Hack failed!', 'danger', 2);
          }
          player.skillCooldown = player.roleData.skill.cooldown;
        } else {
          this.notifications.add('No hackable target nearby', 'warning', 2);
        }
        break;

      case 'soldier':
        if (!player.suppressiveFireActive) {
          player.suppressiveFireActive = true;
          player.suppressiveFireTimer = player.roleData.skill.duration;
          player.skillCooldown = player.roleData.skill.cooldown;
          this.notifications.add('SUPPRESSIVE FIRE!', 'info', 2);
          this.audio.playSound('skill');
        }
        break;

      case 'killer':
        // Killer skill is passive (First Blood), Q does nothing extra
        this.notifications.add('First Blood activates on kills (30% chance)', 'info', 2);
        break;
    }
  }

  handleInteraction() {
    const player = this.player;
    
    // Check doors
    const facingTX = Math.floor((player.x + Math.cos(player.angle) * 30) / TILE_SIZE);
    const facingTY = Math.floor((player.y + Math.sin(player.angle) * 30) / TILE_SIZE);
    const door = this.world.doors.find(d => d.x === facingTX && d.y === facingTY);
    if (door) {
      if (door.locked) {
        // Can crowbar pry open
        const weapon = player.getWeapon();
        if (weapon && weapon.canPry) {
          door.locked = false;
          door.open = true;
          this.world.tiles[door.y][door.x] = TILE.FLOOR;
          this.notifications.add('Door pried open!', 'success');
          this.audio.playSound('pickup');
          return;
        }
        this.notifications.add('Door is locked!', 'warning');
        return;
      }
      door.open = !door.open;
      this.world.tiles[door.y][door.x] = door.open ? TILE.FLOOR : TILE.DOOR;
      return;
    }

    // Check nearby loot
    if (this.player.nearbyLoot.length > 0) {
      const loot = this.player.nearbyLoot[0];
      if (loot._items) {
        for (const item of loot._items) {
          if (player.inventory.length >= player.maxInventorySlots && 
              !(item.stackable && player.inventory.find(i => i.name === item.name))) {
            this.notifications.add('Inventory full!', 'warning');
            break;
          }
          this.addToInventory(player, item);
          player.stats.itemsLooted++;
        }
        loot._items = null;
        loot.looted = true;
        this.audio.playSound('pickup');
        this.notifications.add('Items collected!', 'loot');
      }
    }

    // Check dropped items
    const nearDropped = this.lootSystem.droppedItems.filter(i => dist(i.x, i.y, player.x, player.y) < 40);
    if (nearDropped.length > 0) {
      const item = nearDropped[0];
      if (player.inventory.length >= player.maxInventorySlots && 
          !(item.item.stackable && player.inventory.find(i => i.name === item.item.name))) {
        this.notifications.add('Inventory full!', 'warning');
      } else {
        this.addToInventory(player, item.item);
        player.stats.itemsLooted++;
        const idx = this.lootSystem.droppedItems.indexOf(item);
        this.lootSystem.droppedItems.splice(idx, 1);
        this.audio.playSound('pickup');
        this.notifications.add(`Picked up: ${item.item.name}`, 'loot');
      }
      return;
    }

    // Check airdrops
    for (const drop of this.airdropSystem.airdrops) {
      if (drop.status === 'landed' && dist(drop.x, drop.y, player.x, player.y) < 50) {
        const loot = this.airdropSystem.interact(drop);
        if (loot) {
          for (const item of loot) {
            this.addToInventory(player, item);
          }
          this.audio.playSound('pickup');
          this.notifications.add('AIRDROP COLLECTED!', 'loot', 3);
        }
        return;
      }
    }

    // Check NPCs
    if (this.player.nearbyNPC) {
      const npc = this.player.nearbyNPC;
      if (!npc.hostile) {
        this.dialogState = npc.interact(player);
        this.state = 'dialog';
        this.tradeItems = null;
        this.selectedTradeItem = -1;
      }
      return;
    }

    // Check safehouse
    if (this.player.nearbySafehouse) {
      this.notifications.add(`At ${this.player.nearbySafehouse.name} — Press B for crafting`, 'info');
    }
  }

  addToInventory(player, item) {
    // Try stacking
    if (item.stackable) {
      const existing = player.inventory.find(i => i.name === item.name);
      if (existing) {
        existing.count = (existing.count || 1) + (item.count || 1);
        return;
      }
    }
    player.inventory.push({ ...item });
  }

  checkNearbyObjects() {
    const player = this.player;
    player.nearbyLoot = [];
    player.nearbyNPC = null;
    player.nearbySafehouse = null;

    // Loot spots
    for (const spot of this.world.lootSpots) {
      if (spot.looted) continue;
      if (dist(spot.x, spot.y, player.x, player.y) < 40) {
        if (!spot._items) {
          spot._items = this.lootSystem.generateLoot(spot.type);
        }
        player.nearbyLoot.push(spot);
      }
    }

    // NPCs
    for (const npc of this.entities.npcs) {
      if (!npc.alive) continue;
      if (dist(npc.x, npc.y, player.x, player.y) < 50) {
        player.nearbyNPC = npc;
        break;
      }
    }

    // Safehouses
    for (const sh of this.world.safehouses) {
      if (dist(sh.x, sh.y, player.x, player.y) < 60) {
        player.nearbySafehouse = sh;
        break;
      }
    }
  }

  // ============================================================
  // ENTITY UPDATES
  // ============================================================
  updateZombies(dt) {
    const player = this.player;
    
    for (let i = this.entities.zombies.length - 1; i >= 0; i--) {
      const zombie = this.entities.zombies[i];
      
      if (zombie.hp <= 0) {
        zombie.state = ZOMBIE_STATES.DEAD;
        continue;
      }

      // Cull distant zombies (don't update AI)
      const d = dist(zombie.x, zombie.y, player.x, player.y);
      if (d > 1200) continue;

      // Hacked zombie logic
      if (zombie._hacked) {
        zombie._hackTimer -= dt;
        if (zombie._hackTimer <= 0) {
          zombie._hacked = false;
        } else {
          // Attack nearest non-hacked zombie
          let closestEnemy = null;
          let closestDist = 300;
          for (const other of this.entities.zombies) {
            if (other === zombie || other.hp <= 0 || other._hacked) continue;
            const d2 = dist(zombie.x, zombie.y, other.x, other.y);
            if (d2 < closestDist) {
              closestEnemy = other;
              closestDist = d2;
            }
          }
          if (closestEnemy) {
            zombie.moveToward(closestEnemy.x, closestEnemy.y, zombie.moveSpeed * 1.2, dt, this.collision);
            if (closestDist < zombie.attackRange + closestEnemy.radius && zombie.attackTimer <= 0) {
              zombie.attackTimer = zombie.attackCooldown;
              const dmg = closestEnemy.takeDamage(zombie.damage);
              this.particles.emit(closestEnemy.x, closestEnemy.y, 4, { color: '#44ff44', speed: 60, life: 0.3 });
              if (closestEnemy.hp <= 0) {
                this.onZombieKilled(closestEnemy, player);
              }
            }
          }
          continue;
        }
      }

      const result = zombie.update(dt, player, this.collision, this.entities);
      
      if (result) {
        switch (result.type) {
          case 'melee_attack':
            const actualDmg = player.takeDamage(result.damage, zombie.isBoss ? 'boss' : 'zombie');
            if (actualDmg > 0) {
              this.camera.addShake(3);
              this.audio.playSound('hit', 0.5);
              this.particles.emit(player.x, player.y, 6, { color: '#ff0000', speed: 80, life: 0.3 });
            }
            break;
            
          case 'spit': {
            const proj = new Projectile(
              result.x, result.y,
              angle(result.x, result.y, result.targetX, result.targetY),
              zombie.data.projectileSpeed || 200,
              zombie.damage,
              zombie.data.attackRange || 200,
              zombie.id,
              { radius: zombie.data.projectileRadius || 6, color: '#88ff44', trailColor: '#44aa22' }
            );
            this.entities.projectiles.push(proj);
            break;
          }

          case 'scream': {
            // Attract nearby zombies
            let attracted = 0;
            for (const other of this.entities.zombies) {
              if (other === zombie || other.hp <= 0) continue;
              if (attracted >= result.count) break;
              const d2 = dist(other.x, other.y, result.x, result.y);
              if (d2 < result.radius) {
                other.state = ZOMBIE_STATES.CHASE;
                other.aggroTarget = player;
                attracted++;
              }
            }
            this.notifications.add('Screamer called for reinforcements!', 'danger');
            this.particles.emit(zombie.x, zombie.y, 20, { color: '#cc88cc', speed: 150, life: 0.5, size: 3 });
            break;
          }

          case 'boss_attack': {
            if (result.attack === 'slam' || result.attack === 'groundPound' || result.attack === 'swipe') {
              if (d < (result.range || 50) + player.radius) {
                const actualDmg = player.takeDamage(result.damage, 'boss');
                if (actualDmg > 0) {
                  this.camera.addShake(8);
                  this.audio.playSound('explosion', 0.5);
                  this.particles.emit(player.x, player.y, 15, { color: '#ff4444', speed: 150, life: 0.5 });
                }
                if (result.stunDuration) {
                  // Could stun player briefly
                }
              }
              this.particles.emit(zombie.x, zombie.y, 20, { color: '#ff8844', speed: 120, life: 0.4 });
            }
            if (result.attack === 'radiationBurst' || result.attack === 'toxicWave') {
              if (d < result.radius) {
                player.takeDamage(result.damage, 'boss');
                if (result.dotDamage) {
                  player.bleeding += result.dotDamage;
                }
              }
              this.particles.emit(zombie.x, zombie.y, 30, { color: '#44ffaa', speed: 200, life: 0.6, size: 5 });
            }
            if (result.attack === 'berserkerRage') {
              zombie.moveSpeed *= result.speedBoost;
              zombie.damage *= 1.3;
              setTimeout(() => {
                zombie.moveSpeed /= result.speedBoost;
                zombie.damage /= 1.3;
              }, (result.duration || 5) * 1000);
              this.notifications.add('ALPHA OVERLORD enters BERSERKER RAGE!', 'danger', 3);
            }
            break;
          }

          case 'boss_summon': {
            for (let j = 0; j < result.count; j++) {
              const angle = Math.random() * Math.PI * 2;
              const sx = result.x + Math.cos(angle) * 80;
              const sy = result.y + Math.sin(angle) * 80;
              const type = randomChoice(['walker', 'runner', 'runner']);
              const summon = new Zombie(type, sx, sy);
              summon.state = ZOMBIE_STATES.CHASE;
              summon.aggroTarget = player;
              this.entities.zombies.push(summon);
            }
            this.notifications.add('Reinforcements summoned!', 'danger', 2);
            break;
          }
        }
      }
    }
  }

  updateNPCs(dt) {
    for (const npc of this.entities.npcs) {
      if (!npc.alive) continue;
      const d = dist(npc.x, npc.y, this.player.x, this.player.y);
      if (d > 800) continue;
      
      const result = npc.update(dt, this.player, this.collision);
      if (result && result.type === 'npc_attack') {
        const actualDmg = this.player.takeDamage(result.damage, 'zombie');
        if (actualDmg > 0) {
          this.camera.addShake(2);
          this.audio.playSound('hit', 0.5);
        }
      }
    }
  }

  updateProjectiles(dt) {
    for (let i = this.entities.projectiles.length - 1; i >= 0; i--) {
      const proj = this.entities.projectiles[i];
      proj.update(dt, this.collision);
      
      if (!proj.alive) {
        // Explosive projectiles
        if (proj.explosive) {
          this.handleExplosion(proj.x, proj.y, proj.explosionRadius, proj.damage, proj.owner);
        }
        this.entities.projectiles.splice(i, 1);
        continue;
      }

      // Hit detection
      if (proj.owner === 'player') {
        for (const zombie of this.entities.zombies) {
          if (zombie.hp <= 0) continue;
          if (dist(proj.x, proj.y, zombie.x, zombie.y) < zombie.radius + proj.radius) {
            if (proj.explosive) {
              this.handleExplosion(proj.x, proj.y, proj.explosionRadius, proj.damage, proj.owner);
            } else {
              const mods = this.player.getDamageModifiers();
              let actualDmg = zombie.takeDamage(proj.damage);
              this.player.stats.damageDealt += actualDmg;
              this.particles.emit(proj.x, proj.y, 5, { color: '#88ff44', speed: 80, life: 0.3 });
              
              // Knockback
              const kb = 5;
              const kbAngle = angle(proj.x, proj.y, zombie.x, zombie.y);
              zombie.x += Math.cos(kbAngle) * kb;
              zombie.y += Math.sin(kbAngle) * kb;

              if (zombie.hp <= 0) {
                this.onZombieKilled(zombie, this.player);
              }
            }
            proj.alive = false;
            this.entities.projectiles.splice(i, 1);
            break;
          }
        }
        // Hit NPCs
        if (proj.alive) {
          for (const npc of this.entities.npcs) {
            if (!npc.alive) continue;
            if (dist(proj.x, proj.y, npc.x, npc.y) < npc.radius + proj.radius) {
              npc.takeDamage(proj.damage);
              proj.alive = false;
              this.entities.projectiles.splice(i, 1);
              if (!npc.alive) {
                this.notifications.add(`${npc.name} has been killed`, 'danger');
              }
              break;
            }
          }
        }
      } else {
        // Enemy projectile hits player
        if (dist(proj.x, proj.y, this.player.x, this.player.y) < this.player.radius + proj.radius) {
          const actualDmg = this.player.takeDamage(proj.damage, 'zombie');
          if (actualDmg > 0) {
            this.camera.addShake(3);
            this.particles.emit(this.player.x, this.player.y, 6, { color: '#ff0000', speed: 80, life: 0.3 });
          }
          proj.alive = false;
          this.entities.projectiles.splice(i, 1);
        }
      }
    }
  }

  handleExplosion(x, y, radius, damage, owner) {
    this.audio.playSound('explosion');
    this.camera.addShake(10);
    this.particles.emit(x, y, 30, { color: '#ff8800', speed: 200, life: 0.5, size: 6 });
    this.particles.emit(x, y, 20, { color: '#ffff00', speed: 150, life: 0.3, size: 4 });

    // Damage entities in radius
    if (owner === 'player') {
      for (const zombie of this.entities.zombies) {
        if (zombie.hp <= 0) continue;
        const d = dist(x, y, zombie.x, zombie.y);
        if (d < radius) {
          const falloff = 1 - (d / radius);
          const dmg = damage * falloff;
          const actualDmg = zombie.takeDamage(dmg);
          this.player.stats.damageDealt += actualDmg;
          if (zombie.hp <= 0) {
            this.onZombieKilled(zombie, this.player);
          }
        }
      }
      // Self damage
      const playerDist = dist(x, y, this.player.x, this.player.y);
      if (playerDist < radius) {
        const falloff = 1 - (playerDist / radius);
        this.player.takeDamage(damage * falloff * 0.5, 'explosion');
      }
    } else {
      // Enemy explosion damages player
      const playerDist = dist(x, y, this.player.x, this.player.y);
      if (playerDist < radius) {
        const falloff = 1 - (playerDist / radius);
        this.player.takeDamage(damage * falloff, 'boss');
      }
    }
  }

  spawnZombie() {
    const player = this.player;
    const angle = Math.random() * Math.PI * 2;
    const d = this.spawnRadius + Math.random() * 200;
    const sx = player.x + Math.cos(angle) * d;
    const sy = player.y + Math.sin(angle) * d;
    
    // Check if valid position
    const tx = Math.floor(sx / TILE_SIZE);
    const ty = Math.floor(sy / TILE_SIZE);
    if (tx < 0 || tx >= WORLD_TILES_X || ty < 0 || ty >= WORLD_TILES_Y) return;
    if (this.collision.isSolid(tx, ty)) return;
    
    // Choose type based on area and time
    const isNight = this.dayTime > NIGHT_START || this.dayTime < NIGHT_END;
    let types = ['walker', 'walker', 'runner'];
    if (isNight) types.push('runner', 'runner', 'spitter', 'armored');
    if (Math.random() < 0.1) types.push('brute');
    if (Math.random() < 0.05) types.push('screamer');
    if (Math.random() < 0.03) types.push('mutated', 'radiated');
    
    const type = randomChoice(types);
    const zombie = new Zombie(type, sx, sy);
    if (isNight) {
      zombie.detectionRange *= 1.3;
      zombie.moveSpeed *= 1.1;
    }
    this.entities.zombies.push(zombie);
  }

  // ============================================================
  // RENDERING
  // ============================================================
  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    switch (this.state) {
      case 'menu':
        this.renderMenu(ctx);
        break;
      case 'charselect':
        this.renderCharSelect(ctx);
        break;
      case 'playing':
        this.renderGame(ctx);
        this.renderHUD(ctx);
        break;
      case 'paused':
        this.renderGame(ctx);
        this.renderHUD(ctx);
        this.renderPause(ctx);
        break;
      case 'inventory':
        this.renderGame(ctx);
        this.renderHUD(ctx);
        this.renderInventory(ctx);
        break;
      case 'map':
        this.renderGame(ctx);
        this.renderHUD(ctx);
        this.renderMap(ctx);
        break;
      case 'quest':
        this.renderGame(ctx);
        this.renderHUD(ctx);
        this.renderQuestJournal(ctx);
        break;
      case 'dialog':
        this.renderGame(ctx);
        this.renderHUD(ctx);
        this.renderDialog(ctx);
        break;
      case 'crafting':
        this.renderGame(ctx);
        this.renderHUD(ctx);
        this.renderCrafting(ctx);
        break;
      case 'charstats':
        this.renderGame(ctx);
        this.renderHUD(ctx);
        this.renderCharStats(ctx);
        break;
      case 'settings':
        this.renderGame(ctx);
        this.renderHUD(ctx);
        this.renderSettings(ctx);
        break;
      case 'dead':
        this.renderGame(ctx);
        this.renderDeathScreen(ctx);
        break;
    }
  }

  // ============================================================
  // RENDER: GAME WORLD
  // ============================================================
  renderGame(ctx) {
    const off = this.camera.getOffset();
    const isNight = this.dayTime > NIGHT_START || this.dayTime < NIGHT_END;
    
    // Determine night darkness
    let nightAlpha = 0;
    if (isNight) {
      if (this.dayTime > NIGHT_START) {
        nightAlpha = Math.min(0.5, (this.dayTime - NIGHT_START) / 0.15);
      } else {
        nightAlpha = Math.max(0, 0.5 - (this.dayTime / NIGHT_END) * 0.5);
      }
    }

    // Background
    ctx.fillStyle = '#1a2a1a';
    ctx.fillRect(0, 0, this.width, this.height);

    // Render tiles
    const startTX = Math.max(0, Math.floor(off.x / TILE_SIZE) - 1);
    const startTY = Math.max(0, Math.floor(off.y / TILE_SIZE) - 1);
    const endTX = Math.min(WORLD_TILES_X, Math.ceil((off.x + this.width) / TILE_SIZE) + 1);
    const endTY = Math.min(WORLD_TILES_Y, Math.ceil((off.y + this.height) / TILE_SIZE) + 1);

    for (let ty = startTY; ty < endTY; ty++) {
      for (let tx = startTX; tx < endTX; tx++) {
        const tile = this.world.tiles[ty][tx];
        const px = tx * TILE_SIZE - off.x;
        const py = ty * TILE_SIZE - off.y;
        
        switch (tile) {
          case TILE.GRASS:
            ctx.fillStyle = '#2d5a1e';
            ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            // Grass detail
            if ((tx + ty) % 3 === 0) {
              ctx.fillStyle = '#346b23';
              ctx.fillRect(px + 5, py + 5, 2, 8);
              ctx.fillRect(px + 20, py + 15, 2, 6);
            }
            break;
          case TILE.ROAD:
            ctx.fillStyle = '#333338';
            ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            // Road markings
            if (tx % 4 === 0) {
              ctx.fillStyle = '#555555';
              ctx.fillRect(px + TILE_SIZE / 2 - 1, py, 2, TILE_SIZE);
            }
            break;
          case TILE.SIDEWALK:
            ctx.fillStyle = '#555550';
            ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            break;
          case TILE.WALL:
            ctx.fillStyle = '#5a5a6a';
            ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            ctx.strokeStyle = '#4a4a5a';
            ctx.lineWidth = 1;
            ctx.strokeRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);
            break;
          case TILE.FLOOR:
            ctx.fillStyle = '#3a3a35';
            ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            break;
          case TILE.DOOR:
            ctx.fillStyle = '#8b6914';
            ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            ctx.fillStyle = '#6b4914';
            ctx.fillRect(px + TILE_SIZE / 2 - 2, py + 2, 4, TILE_SIZE - 4);
            break;
          case TILE.SAFEHOUSE:
            ctx.fillStyle = '#1a3a2a';
            ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            if ((tx + ty) % 2 === 0) {
              ctx.fillStyle = '#2a4a3a';
              ctx.fillRect(px + 2, py + 2, TILE_SIZE - 4, TILE_SIZE - 4);
            }
            break;
        }
      }
    }

    // Render loot spots
    for (const spot of this.world.lootSpots) {
      if (!this.camera.isVisible(spot.x, spot.y)) continue;
      if (spot.looted) continue;
      const sx = spot.x - off.x;
      const sy = spot.y - off.y;
      ctx.fillStyle = '#ffcc00';
      ctx.globalAlpha = 0.6 + Math.sin(this.gameTime * 3) * 0.2;
      ctx.beginPath();
      ctx.arc(sx, sy, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Render dropped items
    for (const item of this.lootSystem.droppedItems) {
      if (!this.camera.isVisible(item.x, item.y)) continue;
      const ix = item.x - off.x;
      const iy = item.y - off.y + Math.sin(this.gameTime * 2 + item.bobOffset) * 3;
      
      const rarityColor = item.item.weapon ? RARITY_COLORS[item.item.weapon.rarity] : '#cccccc';
      ctx.fillStyle = rarityColor;
      ctx.beginPath();
      ctx.arc(ix, iy, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Render safehouses
    for (const sh of this.world.safehouses) {
      if (!this.camera.isVisible(sh.x, sh.y)) continue;
      const sx = sh.x - off.x;
      const sy = sh.y - off.y;
      ctx.strokeStyle = '#44ff44';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.5 + Math.sin(this.gameTime * 2) * 0.2;
      ctx.strokeRect(sx - 20, sy - 20, 40, 40);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#44ff44';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('SAFE', sx, sy - 24);
      ctx.textAlign = 'left';
    }

    // Render airdrops
    for (const drop of this.airdropSystem.airdrops) {
      if (!this.camera.isVisible(drop.x, drop.y)) continue;
      const dx = drop.x - off.x;
      const dy = drop.y - off.y;
      
      if (drop.status === 'incoming') {
        // Parachute animation
        const progress = 1 - (drop.fallTimer / 5);
        const fallY = -300 + progress * 300;
        ctx.fillStyle = '#ffcc00';
        ctx.fillRect(dx - 8, dy + fallY - 8, 16, 16);
        // Parachute
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(dx, dy + fallY - 25, 15, Math.PI, 0);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(dx - 15, dy + fallY - 25);
        ctx.lineTo(dx - 5, dy + fallY - 8);
        ctx.moveTo(dx + 15, dy + fallY - 25);
        ctx.lineTo(dx + 5, dy + fallY - 8);
        ctx.stroke();
      } else if (drop.status === 'landed') {
        // Crate with smoke
        ctx.fillStyle = '#ffcc00';
        ctx.fillRect(dx - 10, dy - 10, 20, 20);
        ctx.strokeStyle = '#aa8800';
        ctx.lineWidth = 2;
        ctx.strokeRect(dx - 10, dy - 10, 20, 20);
        
        // Smoke
        ctx.globalAlpha = 0.3 + Math.sin(this.gameTime * 3) * 0.1;
        ctx.fillStyle = '#ff8800';
        ctx.beginPath();
        ctx.arc(dx, dy - 20 - Math.sin(this.gameTime * 2) * 5, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        
        // Label
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('AIRDROP', dx, dy - 18);
        ctx.textAlign = 'left';
      }
    }

    // Render NPCs
    for (const npc of this.entities.npcs) {
      if (!npc.alive) continue;
      if (!this.camera.isVisible(npc.x, npc.y)) continue;
      this.renderNPC(ctx, npc, off);
    }

    // Render zombies
    for (const zombie of this.entities.zombies) {
      if (zombie.hp <= 0) continue;
      if (!this.camera.isVisible(zombie.x, zombie.y)) continue;
      this.renderZombie(ctx, zombie, off);
    }

    // Render projectiles
    for (const proj of this.entities.projectiles) {
      if (!proj.alive) continue;
      const px = proj.x - off.x;
      const py = proj.y - off.y;
      
      // Trail
      ctx.strokeStyle = proj.trailColor;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.5;
      for (let i = 0; i < proj.trail.length - 1; i++) {
        const alpha = i / proj.trail.length;
        ctx.globalAlpha = alpha * 0.5;
        ctx.beginPath();
        ctx.moveTo(proj.trail[i].x - off.x, proj.trail[i].y - off.y);
        ctx.lineTo(proj.trail[i + 1].x - off.x, proj.trail[i + 1].y - off.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      
      // Projectile
      ctx.fillStyle = proj.color;
      ctx.beginPath();
      ctx.arc(px, py, proj.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Render player
    this.renderPlayer(ctx, off);

    // Render particles
    this.particles.render(ctx, this.camera);

    // Night overlay
    if (nightAlpha > 0) {
      ctx.fillStyle = `rgba(0, 0, 20, ${nightAlpha})`;
      ctx.fillRect(0, 0, this.width, this.height);
      
      // Player light circle
      const playerScreenX = this.player.x - off.x;
      const playerScreenY = this.player.y - off.y;
      const gradient = ctx.createRadialGradient(playerScreenX, playerScreenY, 50, playerScreenX, playerScreenY, 200);
      gradient.addColorStop(0, `rgba(0, 0, 20, 0)`);
      gradient.addColorStop(1, `rgba(0, 0, 20, ${nightAlpha})`);
      ctx.fillStyle = gradient;
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillRect(playerScreenX - 200, playerScreenY - 200, 400, 400);
      ctx.globalCompositeOperation = 'source-over';
    }

    // Notifications
    this.notifications.render(ctx, this.width);

    // Interact prompt
    if (this.player.nearbyLoot.length > 0 || this.player.nearbyNPC || this.player.nearbySafehouse ||
        this.airdropSystem.airdrops.some(d => d.status === 'landed' && dist(d.x, d.y, this.player.x, this.player.y) < 50)) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(this.width / 2 - 80, this.height - 100, 160, 30);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('[E] Interact', this.width / 2, this.height - 80);
      ctx.textAlign = 'left';
    }
  }

  renderPlayer(ctx, off) {
    const player = this.player;
    const px = player.x - off.x;
    const py = player.y - off.y;
    const angle = player.angle;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(px, py + player.radius, player.radius * 0.8, player.radius * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body
    ctx.fillStyle = player.firstBloodActive ? '#ff4444' : (player.suppressiveFireActive ? '#44aa44' : '#4488cc');
    ctx.beginPath();
    ctx.arc(px, py, player.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2266aa';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Role indicator
    ctx.fillStyle = player.roleData.color;
    ctx.beginPath();
    ctx.arc(px, py, player.radius * 0.5, 0, Math.PI * 2);
    ctx.fill();

    // Direction indicator (weapon)
    const weapon = player.getWeapon();
    const gunLen = weapon && weapon.type !== WEAPON_TYPES.MELEE ? 18 : 14;
    ctx.strokeStyle = weapon ? '#cccccc' : '#888888';
    ctx.lineWidth = weapon && weapon.type !== WEAPON_TYPES.MELEE ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(px + Math.cos(angle) * player.radius * 0.5, py + Math.sin(angle) * player.radius * 0.5);
    ctx.lineTo(px + Math.cos(angle) * (player.radius + gunLen), py + Math.sin(angle) * (player.radius + gunLen));
    ctx.stroke();

    // Melee arc indicator when attacking
    if (weapon && weapon.type === WEAPON_TYPES.MELEE && weapon._cooldown > 0.8 / weapon.attackRate) {
      const arc = weapon.arcAngle || Math.PI / 3;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, weapon.range + player.radius, angle - arc / 2, angle + arc / 2);
      ctx.stroke();
    }

    // First Blood effect
    if (player.firstBloodActive) {
      ctx.strokeStyle = '#ff0000';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.5 + Math.sin(this.gameTime * 8) * 0.3;
      ctx.beginPath();
      ctx.arc(px, py, player.radius + 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Suppressive Fire effect
    if (player.suppressiveFireActive) {
      ctx.strokeStyle = '#44ff44';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.4 + Math.sin(this.gameTime * 6) * 0.2;
      ctx.beginPath();
      ctx.arc(px, py, player.radius + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Armor indicator
    if (player.armor) {
      ctx.strokeStyle = '#aaaaff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, player.radius + 2, 0, Math.PI * 2 * (player.armorDurability / player.armor.maxDurability));
      ctx.stroke();
    }
  }

  renderZombie(ctx, zombie, off) {
    const zx = zombie.x - off.x;
    const zy = zombie.y - off.y;
    const data = zombie.data;
    
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(zx, zy + zombie.radius * 0.8, zombie.radius * 0.6, zombie.radius * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body
    ctx.fillStyle = zombie._hacked ? '#44ff44' : (zombie.stunTimer > 0 ? '#888888' : data.color);
    ctx.beginPath();
    ctx.arc(zx, zy, zombie.radius, 0, Math.PI * 2);
    ctx.fill();
    
    // Boss border
    if (zombie.isBoss) {
      ctx.strokeStyle = '#ff4444';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.strokeStyle = data.color;
    } else {
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Direction
    ctx.strokeStyle = zombie._hacked ? '#88ff88' : '#aa4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(zx, zy);
    ctx.lineTo(zx + Math.cos(zombie.angle) * zombie.radius * 1.3, zy + Math.sin(zombie.angle) * zombie.radius * 1.3);
    ctx.stroke();

    // Boss HP bar
    if (zombie.isBoss) {
      const barW = 60;
      const barH = 6;
      const barX = zx - barW / 2;
      const barY = zy - zombie.radius - 15;
      
      // Background
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
      
      // HP bar
      const hpPercent = zombie.hp / zombie.maxHp;
      const hpColor = hpPercent > 0.5 ? '#44ff44' : (hpPercent > 0.25 ? '#ffaa00' : '#ff4444');
      ctx.fillStyle = hpColor;
      ctx.fillRect(barX, barY, barW * hpPercent, barH);
      
      // Name
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(zombie.bossData.name, zx, barY - 4);
      
      // Phase
      const phase = zombie.bossData.phases[zombie.bossPhase];
      ctx.fillStyle = '#ffaa00';
      ctx.fillText(phase.name, zx, barY - 14);
      ctx.textAlign = 'left';
      
      // Vulnerability indicator
      if (zombie.vulnerable) {
        ctx.fillStyle = '#ffff00';
        ctx.font = 'bold 8px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('VULNERABLE!', zx, barY - 22);
        ctx.textAlign = 'left';
      }
    }

    // Hacked indicator
    if (zombie._hacked) {
      ctx.fillStyle = '#44ff44';
      ctx.font = '8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('HACKED', zx, zy - zombie.radius - 5);
      ctx.textAlign = 'left';
    }

    // Health bar for damaged non-boss zombies
    if (!zombie.isBoss && zombie.hp < zombie.maxHp) {
      const barW = zombie.radius * 2;
      const barH = 3;
      ctx.fillStyle = '#333';
      ctx.fillRect(zx - barW / 2, zy - zombie.radius - 8, barW, barH);
      ctx.fillStyle = '#ff4444';
      ctx.fillRect(zx - barW / 2, zy - zombie.radius - 8, barW * (zombie.hp / zombie.maxHp), barH);
    }
  }

  renderNPC(ctx, npc, off) {
    const nx = npc.x - off.x;
    const ny = npc.y - off.y;
    
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(nx, ny + npc.radius, npc.radius * 0.7, npc.radius * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body color based on type
    const colors = {
      friendly: '#44aaff',
      neutral: '#aaaaaa',
      hostile: '#ff4444',
      specialist: '#ffaa44',
    };
    ctx.fillStyle = npc.hostile ? '#ff4444' : (colors[npc.type] || '#888888');
    ctx.beginPath();
    ctx.arc(nx, ny, npc.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Name tag
    ctx.fillStyle = '#ffffff';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(npc.name, nx, ny - npc.radius - 8);
    
    // Faction
    ctx.fillStyle = '#aaaaaa';
    ctx.font = '8px monospace';
    ctx.fillText(npc.faction, nx, ny - npc.radius - 18);
    ctx.textAlign = 'left';

    // Quest indicator
    if (npc.questAvailable && npc.quest) {
      ctx.fillStyle = '#ffcc00';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('!', nx, ny - npc.radius - 26);
      ctx.textAlign = 'left';
    }

    // Health bar if damaged
    if (npc.hp < npc.maxHp) {
      const barW = npc.radius * 2;
      ctx.fillStyle = '#333';
      ctx.fillRect(nx - barW / 2, ny - npc.radius - 2, barW, 3);
      ctx.fillStyle = npc.hostile ? '#ff4444' : '#44aaff';
      ctx.fillRect(nx - barW / 2, ny - npc.radius - 2, barW * (npc.hp / npc.maxHp), 3);
    }
  }

  // ============================================================
  // RENDER: HUD
  // ============================================================
  renderHUD(ctx) {
    const player = this.player;
    const margin = 10;
    const barW = 200;
    const barH = 16;
    let y = this.height - 170;

    // Semi-transparent background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(margin - 5, y - 5, barW + 80, 165);
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    ctx.strokeRect(margin - 5, y - 5, barW + 80, 165);

    // HP Bar
    this.drawBar(ctx, margin, y, barW, barH, player.hp, player.maxHP, '#cc3333', '#333', 'HP');
    y += barH + 4;

    // Armor
    if (player.armor) {
      this.drawBar(ctx, margin, y, barW, barH, player.armorDurability, player.armor.maxDurability, '#6666cc', '#333', 'ARMOR');
      y += barH + 4;
    }

    // Stamina
    this.drawBar(ctx, margin, y, barW, barH, player.stamina, player.staminaMax, '#cccc33', '#333', 'STAM');
    y += barH + 4;

    // Hunger
    this.drawBar(ctx, margin, y, barW * 0.48, barH - 2, player.hunger, 100, '#cc8833', '#333', 'HNG');
    // Thirst
    this.drawBar(ctx, margin + barW * 0.52, y, barW * 0.48, barH - 2, player.thirst, 100, '#3388cc', '#333', 'THR');
    y += barH + 2;

    // Bleeding/Infection indicators
    if (player.bleeding > 0) {
      ctx.fillStyle = '#ff4444';
      ctx.font = 'bold 10px monospace';
      ctx.fillText(`BLEEDING ${Math.ceil(player.bleeding)}/s`, margin, y + 10);
      y += 14;
    }
    if (player.infection > 0) {
      ctx.fillStyle = '#88ff44';
      ctx.font = 'bold 10px monospace';
      ctx.fillText(`INFECTION ${Math.ceil(player.infection)}/s`, margin, y + 10);
      y += 14;
    }

    // Weapon info
    const weapon = player.getWeapon();
    if (weapon) {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px monospace';
      ctx.fillText(weapon.name, margin, this.height - 12);
      
      if (weapon.type !== WEAPON_TYPES.MELEE) {
        const mag = weapon.currentMagazine !== undefined ? weapon.currentMagazine : '?';
        const ammo = player.ammo[weapon.ammoType] || 0;
        ctx.fillStyle = ammo > 0 ? '#cccccc' : '#ff4444';
        ctx.fillText(`${mag} / ${ammo}`, margin + 150, this.height - 12);
      } else {
        ctx.fillStyle = '#888888';
        ctx.fillText('MELEE', margin + 150, this.height - 12);
      }

      // Rarity
      ctx.fillStyle = RARITY_COLORS[weapon.rarity] || '#ffffff';
      ctx.font = '9px monospace';
      ctx.fillText(weapon.rarity.toUpperCase(), margin, this.height - 26);
    }

    // Weapon slots
    for (let i = 0; i < Math.min(5, player.weapons.length); i++) {
      const slotX = margin + i * 50;
      const slotY = this.height - 50;
      const isActive = i === player.currentWeaponIdx;
      
      ctx.fillStyle = isActive ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(slotX, slotY, 45, 35);
      ctx.strokeStyle = isActive ? '#ffffff' : '#555';
      ctx.lineWidth = isActive ? 2 : 1;
      ctx.strokeRect(slotX, slotY, 45, 35);
      
      ctx.fillStyle = '#ffffff';
      ctx.font = '8px monospace';
      ctx.fillText(`${i + 1}`, slotX + 2, slotY + 10);
      ctx.fillText(player.weapons[i].name.substring(0, 6), slotX + 2, slotY + 22);
    }

    // Skill indicator
    const skill = player.roleData.skill;
    const skillX = margin + 260;
    const skillY = this.height - 170;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(skillX, skillY, 100, 60);
    ctx.strokeStyle = player.skillCooldown > 0 ? '#555' : player.roleData.color;
    ctx.lineWidth = 2;
    ctx.strokeRect(skillX, skillY, 100, 60);
    
    ctx.fillStyle = '#ffffff';
    ctx.font = '10px monospace';
    ctx.fillText(skill.icon + ' ' + skill.name.substring(0, 10), skillX + 5, skillY + 15);
    if (player.skillCooldown > 0) {
      ctx.fillStyle = '#ff4444';
      ctx.fillText(`CD: ${Math.ceil(player.skillCooldown)}s`, skillX + 5, skillY + 30);
    } else {
      ctx.fillStyle = '#44ff44';
      ctx.fillText('[Q] Ready', skillX + 5, skillY + 30);
    }

    // First Blood indicator
    if (player.firstBloodActive) {
      ctx.fillStyle = '#ff0000';
      ctx.font = 'bold 12px monospace';
      ctx.fillText(`FIRST BLOOD: ${Math.ceil(player.firstBloodTimer)}s`, skillX, skillY + 50);
    }

    // Suppressive Fire indicator
    if (player.suppressiveFireActive) {
      ctx.fillStyle = '#44ff44';
      ctx.font = 'bold 12px monospace';
      ctx.fillText(`SUPPRESSIVE: ${Math.ceil(player.suppressiveFireTimer)}s`, skillX, skillY + 50);
    }

    // XP and Level
    ctx.fillStyle = '#ffaa00';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(`Lv.${player.level}`, skillX, skillY - 10);
    this.drawBar(ctx, skillX, skillY - 6, 100, 8, player.xp, player.xpToNextLevel, '#ffaa00', '#333', '');

    // Minimap
    renderMinimap(ctx, player, this.world, this.camera, this.entities, this.width);

    // Game time and day/night indicator
    const isNight = this.dayTime > NIGHT_START || this.dayTime < NIGHT_END;
    ctx.fillStyle = isNight ? '#6666cc' : '#ffcc44';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(isNight ? '🌙 NIGHT' : '☀ DAY', this.width - 160, 180);
    ctx.fillStyle = '#aaaaaa';
    ctx.font = '10px monospace';
    ctx.fillText(formatTime(this.gameTime), this.width - 160, 195);

    // FPS
    ctx.fillStyle = '#666';
    ctx.font = '10px monospace';
    ctx.fillText(`FPS: ${this.fps}`, this.width - 160, 210);

    // Controls hint
    ctx.fillStyle = '#555';
    ctx.font = '9px monospace';
    ctx.fillText('[Tab] Inv  [M] Map  [J] Quest  [C] Stats  [B] Craft  [Esc] Pause', margin, 25);
  }

  drawBar(ctx, x, y, w, h, value, max, color, bgColor, label) {
    const pct = Math.max(0, Math.min(1, value / max));
    ctx.fillStyle = bgColor;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * pct, h);
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    if (label) {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px monospace';
      ctx.fillText(`${label} ${Math.ceil(value)}/${Math.ceil(max)}`, x + 3, y + h - 3);
    }
  }

  // ============================================================
  // RENDER: MENU SCREENS
  // ============================================================
  renderMenu(ctx) {
    // Background
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, this.width, this.height);
    
    // Title
    ctx.fillStyle = '#cc3333';
    ctx.font = 'bold 48px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('LAST SIGNAL', this.width / 2, this.height * 0.2);
    ctx.fillStyle = '#ff6644';
    ctx.font = 'bold 32px monospace';
    ctx.fillText('DEAD ZONE', this.width / 2, this.height * 0.2 + 45);
    
    // Subtitle
    ctx.fillStyle = '#666';
    ctx.font = '14px monospace';
    ctx.fillText('Top-Down Zombie Survival Shooter', this.width / 2, this.height * 0.2 + 75);

    // Menu buttons
    const buttons = [
      { label: 'NEW GAME', action: () => { this.state = 'charselect'; this.charSelectRole = null; } },
      { label: 'CONTINUE', action: () => {
        const save = SaveSystem.load();
        if (save) { this.continueGame(save); } else { this.notifications.add('No save found', 'warning'); }
      }, disabled: !SaveSystem.hasSave() },
      { label: 'CONTROLS', action: () => { this.showControls = !this.showControls; } },
      { label: 'SETTINGS', action: () => { this.state = 'settings'; } },
    ];

    const btnW = 250;
    const btnH = 45;
    const startY = this.height * 0.45;
    
    for (let i = 0; i < buttons.length; i++) {
      const btn = buttons[i];
      const bx = this.width / 2 - btnW / 2;
      const by = startY + i * (btnH + 10);
      
      const isHover = this.input.mouse.x >= bx && this.input.mouse.x <= bx + btnW &&
                      this.input.mouse.y >= by && this.input.mouse.y <= by + btnH;
      
      ctx.fillStyle = btn.disabled ? '#222' : (isHover ? '#444' : '#1a1a1a');
      ctx.fillRect(bx, by, btnW, btnH);
      ctx.strokeStyle = btn.disabled ? '#333' : '#cc3333';
      ctx.lineWidth = isHover ? 2 : 1;
      ctx.strokeRect(bx, by, btnW, btnH);
      
      ctx.fillStyle = btn.disabled ? '#555' : '#ffffff';
      ctx.font = 'bold 16px monospace';
      ctx.fillText(btn.label, this.width / 2, by + btnH / 2 + 6);

      // Handle click
      if (isHover && this.input.mouse.leftDown && !btn.disabled) {
        btn.action();
        this.input.mouse.left = false;
      }
    }

    // Controls display
    if (this.showControls) {
      this.renderControlsHelp(ctx);
    }

    ctx.textAlign = 'left';
  }

  renderControlsHelp(ctx) {
    const controls = [
      'WASD - Move',
      'Mouse - Aim',
      'Left Click - Shoot/Attack',
      'Right Click - Precision Aim',
      'R - Reload',
      'E/F - Interact',
      'Q - Skill',
      '1-5 - Switch Weapon',
      'Tab - Inventory',
      'M - Map',
      'J - Quest Journal',
      'C - Character Stats',
      'B - Crafting',
      'Shift - Sprint',
      'Esc - Pause/Menu',
    ];

    const boxW = 280;
    const boxH = controls.length * 20 + 40;
    const boxX = this.width / 2 - boxW / 2;
    const boxY = this.height / 2 - boxH / 2;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeStyle = '#cc3333';
    ctx.lineWidth = 2;
    ctx.strokeRect(boxX, boxY, boxW, boxH);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('CONTROLS', this.width / 2, boxY + 22);

    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    for (let i = 0; i < controls.length; i++) {
      ctx.fillText(controls[i], boxX + 15, boxY + 42 + i * 20);
    }
  }

  renderCharSelect(ctx) {
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.fillStyle = '#cc3333';
    ctx.font = 'bold 28px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SELECT YOUR ROLE', this.width / 2, 50);

    const roles = Object.values(ROLES);
    const cardW = 260;
    const cardH = 400;
    const gap = 20;
    const totalW = roles.length * cardW + (roles.length - 1) * gap;
    const startX = this.width / 2 - totalW / 2;

    for (let i = 0; i < roles.length; i++) {
      const role = roles[i];
      const cx = startX + i * (cardW + gap);
      const cy = 80;
      const isSelected = this.charSelectRole === role.id;
      const isHover = this.input.mouse.x >= cx && this.input.mouse.x <= cx + cardW &&
                      this.input.mouse.y >= cy && this.input.mouse.y <= cy + cardH;

      // Card background
      ctx.fillStyle = isSelected ? 'rgba(255, 255, 255, 0.1)' : 'rgba(20, 20, 20, 0.9)';
      ctx.fillRect(cx, cy, cardW, cardH);
      ctx.strokeStyle = isSelected ? role.color : (isHover ? '#888' : '#333');
      ctx.lineWidth = isSelected ? 3 : 1;
      ctx.strokeRect(cx, cy, cardW, cardH);

      // Role icon and name
      ctx.fillStyle = role.color;
      ctx.font = '36px serif';
      ctx.textAlign = 'center';
      ctx.fillText(role.icon, cx + cardW / 2, cy + 40);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px monospace';
      ctx.fillText(role.name, cx + cardW / 2, cy + 65);

      // Description
      ctx.fillStyle = '#aaaaaa';
      ctx.font = '10px monospace';
      const words = role.description.split(' ');
      let line = '', lineY = cy + 85;
      for (const word of words) {
        const testLine = line + word + ' ';
        if (ctx.measureText(testLine).width > cardW - 20) {
          ctx.fillText(line.trim(), cx + cardW / 2, lineY);
          line = word + ' ';
          lineY += 14;
        } else {
          line = testLine;
        }
      }
      if (line.trim()) ctx.fillText(line.trim(), cx + cardW / 2, lineY);

      // Stats
      lineY += 20;
      ctx.fillStyle = '#88ccff';
      ctx.font = '9px monospace';
      const stats = role.stats;
      ctx.fillText(`HP: ${Math.round(stats.maxHP)}  Speed: ${Math.round(stats.moveSpeed)}`, cx + cardW / 2, lineY);
      lineY += 14;
      ctx.fillText(`Sprint: ${Math.round(stats.sprintSpeed)}  Stamina: ${Math.round(stats.staminaMax)}`, cx + cardW / 2, lineY);
      lineY += 14;
      ctx.fillText(`Inventory: ${stats.inventorySlots} slots`, cx + cardW / 2, lineY);

      // Skill
      lineY += 20;
      ctx.fillStyle = '#ffcc44';
      ctx.font = 'bold 10px monospace';
      ctx.fillText(`${role.skill.icon} ${role.skill.name}`, cx + cardW / 2, lineY);
      lineY += 14;
      ctx.fillStyle = '#cccccc';
      ctx.font = '8px monospace';
      const skillWords = role.skill.description.split(' ');
      line = '';
      for (const word of skillWords) {
        const testLine = line + word + ' ';
        if (ctx.measureText(testLine).width > cardW - 20) {
          ctx.fillText(line.trim(), cx + cardW / 2, lineY);
          line = word + ' ';
          lineY += 12;
        } else {
          line = testLine;
        }
      }
      if (line.trim()) ctx.fillText(line.trim(), cx + cardW / 2, lineY);

      // Passive
      lineY += 16;
      ctx.fillStyle = '#88ff88';
      ctx.font = 'bold 9px monospace';
      ctx.fillText(`${role.passive.icon} ${role.passive.name}`, cx + cardW / 2, lineY);

      // Weaknesses
      lineY += 16;
      ctx.fillStyle = '#ff6666';
      ctx.font = '8px monospace';
      const weakness = role.id === 'hacker' ? '-20% Max HP' :
                       role.id === 'killer' ? 'Kill speed penalty, Berserk risk' :
                       '-10% Sprint, Heavy weapon penalty';
      ctx.fillText(`Weakness: ${weakness}`, cx + cardW / 2, lineY);

      // Click to select
      if (isHover && this.input.mouse.leftDown) {
        this.charSelectRole = role.id;
        this.input.mouse.left = false;
      }
    }

    // Start button
    if (this.charSelectRole) {
      const btnW = 200;
      const btnH = 45;
      const btnX = this.width / 2 - btnW / 2;
      const btnY = this.height - 70;
      const isHover = this.input.mouse.x >= btnX && this.input.mouse.x <= btnX + btnW &&
                      this.input.mouse.y >= btnY && this.input.mouse.y <= btnY + btnH;

      ctx.fillStyle = isHover ? '#442222' : '#221111';
      ctx.fillRect(btnX, btnY, btnW, btnH);
      ctx.strokeStyle = '#cc3333';
      ctx.lineWidth = 2;
      ctx.strokeRect(btnX, btnY, btnW, btnH);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 18px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('START GAME', this.width / 2, btnY + btnH / 2 + 6);

      if (isHover && this.input.mouse.leftDown) {
        this.startNewGame(this.charSelectRole);
        this.input.mouse.left = false;
      }
    }

    // Back button
    const backX = 20, backY = this.height - 50;
    ctx.fillStyle = '#666';
    ctx.font = '14px monospace';
    ctx.textAlign = 'left';
    const backHover = this.input.mouse.x >= backX && this.input.mouse.x <= backX + 80 &&
                      this.input.mouse.y >= backY - 12 && this.input.mouse.y <= backY + 5;
    ctx.fillStyle = backHover ? '#ffffff' : '#888';
    ctx.fillText('[Esc] Back', backX, backY);
    if (backHover && this.input.mouse.leftDown) {
      this.state = 'menu';
      this.input.mouse.left = false;
    }
    if (this.justPressed('Escape')) {
      this.state = 'menu';
    }

    ctx.textAlign = 'left';
  }

  // ============================================================
  // RENDER: OVERLAY SCREENS
  // ============================================================
  renderPause(ctx) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.fillStyle = '#cc3333';
    ctx.font = 'bold 32px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', this.width / 2, this.height * 0.3);

    const buttons = [
      { label: 'RESUME', action: () => { this.state = 'playing'; } },
      { label: 'SAVE GAME', action: () => {
        const success = SaveSystem.save({
          player: this.player,
          worldSeed: this.worldSeed,
          gameTime: this.gameTime,
          dayTime: this.dayTime,
          zombies: this.entities.zombies,
        });
        this.notifications.add(success ? 'Game saved!' : 'Save failed', success ? 'success' : 'danger');
      }},
      { label: 'SETTINGS', action: () => { this.state = 'settings'; } },
      { label: 'MAIN MENU', action: () => { this.state = 'menu'; } },
    ];

    const btnW = 250;
    const btnH = 40;
    const startY = this.height * 0.4;

    for (let i = 0; i < buttons.length; i++) {
      const btn = buttons[i];
      const bx = this.width / 2 - btnW / 2;
      const by = startY + i * (btnH + 10);
      const isHover = this.input.mouse.x >= bx && this.input.mouse.x <= bx + btnW &&
                      this.input.mouse.y >= by && this.input.mouse.y <= by + btnH;

      ctx.fillStyle = isHover ? '#333' : '#1a1a1a';
      ctx.fillRect(bx, by, btnW, btnH);
      ctx.strokeStyle = '#cc3333';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx, by, btnW, btnH);
      ctx.fillStyle = '#ffffff';
      ctx.font = '14px monospace';
      ctx.fillText(btn.label, this.width / 2, by + btnH / 2 + 5);

      if (isHover && this.input.mouse.leftDown) {
        btn.action();
        this.input.mouse.left = false;
      }
    }

    ctx.textAlign = 'left';
  }

  renderInventory(ctx) {
    const player = this.player;
    const panelW = 500;
    const panelH = 450;
    const panelX = this.width / 2 - panelW / 2;
    const panelY = this.height / 2 - panelH / 2;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillRect(panelX, panelY, panelW, panelH);
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 2;
    ctx.strokeRect(panelX, panelY, panelW, panelH);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px monospace';
    ctx.fillText('INVENTORY', panelX + 15, panelY + 25);
    ctx.fillStyle = '#888';
    ctx.font = '10px monospace';
    ctx.fillText(`${player.inventory.length}/${player.maxInventorySlots} slots`, panelX + 15, panelY + 40);

    // Item list
    const itemH = 32;
    const startY = panelY + 55;
    
    for (let i = 0; i < player.inventory.length; i++) {
      const item = player.inventory[i];
      const iy = startY + i * itemH;
      if (iy + itemH > panelY + panelH - 60) break; // don't overflow

      const isSelected = this.selectedInventorySlot === i;
      const isHover = this.input.mouse.x >= panelX + 10 && this.input.mouse.x <= panelX + panelW - 10 &&
                      this.input.mouse.y >= iy && this.input.mouse.y <= iy + itemH;

      ctx.fillStyle = isSelected ? 'rgba(100, 100, 255, 0.2)' : (isHover ? 'rgba(255, 255, 255, 0.05)' : 'transparent');
      ctx.fillRect(panelX + 10, iy, panelW - 20, itemH);
      ctx.strokeStyle = isSelected ? '#6666ff' : '#333';
      ctx.lineWidth = 1;
      ctx.strokeRect(panelX + 10, iy, panelW - 20, itemH);

      // Item icon/color
      const iconColors = {
        food: '#cc8833',
        water: '#3388cc',
        medical: '#cc3333',
        ammo: '#cccc33',
        weapon: RARITY_COLORS[item.weapon?.rarity] || '#888',
        armor: '#6666cc',
        material: '#888888',
      };
      ctx.fillStyle = iconColors[item.type] || '#888';
      ctx.fillRect(panelX + 15, iy + 4, 24, 24);

      // Item name
      ctx.fillStyle = '#ffffff';
      ctx.font = '11px monospace';
      ctx.fillText(item.name + (item.count > 1 ? ` x${item.count}` : ''), panelX + 45, iy + 16);
      
      // Item type
      ctx.fillStyle = '#888';
      ctx.font = '9px monospace';
      ctx.fillText(item.type, panelX + 45, iy + 27);

      // Use button
      if (isSelected) {
        const useX = panelX + panelW - 120;
        const useHover = this.input.mouse.x >= useX && this.input.mouse.x <= useX + 100 &&
                         this.input.mouse.y >= iy + 2 && this.input.mouse.y <= iy + itemH - 2;

        // Use/Equip button
        ctx.fillStyle = useHover ? '#336633' : '#223322';
        ctx.fillRect(useX, iy + 2, 50, itemH - 4);
        ctx.fillStyle = '#44ff44';
        ctx.font = '9px monospace';
        ctx.fillText('USE', useX + 12, iy + 18);

        // Drop button
        const dropX = useX + 55;
        const dropHover = this.input.mouse.x >= dropX && this.input.mouse.x <= dropX + 40 &&
                          this.input.mouse.y >= iy + 2 && this.input.mouse.y <= iy + itemH - 2;
        ctx.fillStyle = dropHover ? '#663333' : '#332222';
        ctx.fillRect(dropX, iy + 2, 40, itemH - 4);
        ctx.fillStyle = '#ff4444';
        ctx.fillText('DROP', dropX + 5, iy + 18);

        // Handle use
        if (useHover && this.input.mouse.leftDown) {
          this.useItem(i);
          this.input.mouse.left = false;
        }
        // Handle drop
        if (dropHover && this.input.mouse.leftDown) {
          this.dropItem(i);
          this.input.mouse.left = false;
        }
      }

      if (isHover && this.input.mouse.leftDown) {
        this.selectedInventorySlot = isSelected ? -1 : i;
        this.input.mouse.left = false;
      }
    }

    // Equipment section
    const eqX = panelX + panelW - 150;
    const eqY = panelY + 55;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px monospace';
    ctx.fillText('EQUIPPED', eqX, eqY);

    // Current weapon
    const weapon = player.getWeapon();
    if (weapon) {
      ctx.fillStyle = RARITY_COLORS[weapon.rarity] || '#fff';
      ctx.font = '10px monospace';
      ctx.fillText(`Weapon: ${weapon.name}`, eqX, eqY + 20);
      if (weapon.type !== WEAPON_TYPES.MELEE) {
        ctx.fillText(`Ammo: ${weapon.currentMagazine || 0}/${weapon.magazineSize}`, eqX, eqY + 35);
      }
    }

    // Armor
    if (player.armor) {
      ctx.fillStyle = '#6666cc';
      ctx.fillText(`Armor: ${player.armor.name}`, eqX, eqY + 55);
      ctx.fillText(`Dur: ${Math.ceil(player.armorDurability)}/${player.armor.maxDurability}`, eqX, eqY + 70);
      ctx.fillText(`Prot: ${Math.round(player.armor.protection * 100)}%`, eqX, eqY + 85);
    }

    // Close hint
    ctx.fillStyle = '#666';
    ctx.font = '10px monospace';
    ctx.fillText('[Tab] or [Esc] to close', panelX + 15, panelY + panelH - 15);
  }

  useItem(index) {
    const player = this.player;
    const item = player.inventory[index];
    if (!item) return;

    switch (item.type) {
      case 'food':
        player.hunger = Math.min(100, player.hunger + (item.hungerRestore || 20));
        player.heal(item.healAmount || 5);
        this.notifications.add(`Consumed ${item.name}`, 'success');
        this.audio.playSound('pickup');
        break;
      case 'water':
        player.thirst = Math.min(100, player.thirst + (item.thirstRestore || 30));
        this.notifications.add(`Drank ${item.name}`, 'success');
        this.audio.playSound('pickup');
        break;
      case 'medical':
        if (item.infectionCure) {
          player.infection = 0;
          this.notifications.add('Infection cured!', 'success');
        }
        player.heal(item.healAmount || 20);
        player.bleeding = Math.max(0, player.bleeding - 5);
        this.notifications.add(`Used ${item.name}`, 'success');
        this.audio.playSound('pickup');
        break;
      case 'weapon':
        if (player.weapons.length < 5) {
          player.weapons.push(item.weapon);
          this.notifications.add(`Equipped ${item.name}`, 'success');
          this.audio.playSound('pickup');
        } else {
          this.notifications.add('Weapon slots full!', 'warning');
          return; // Don't consume
        }
        break;
      case 'armor':
        player.armor = { ...item, protection: item.protection || 0.3, maxDurability: item.maxDurability || item.durability || 50 };
        player.armorDurability = item.durability || item.maxDurability || 50;
        this.notifications.add(`Equipped ${item.name}`, 'success');
        this.audio.playSound('pickup');
        break;
      case 'ammo':
        const ammoType = item.ammoType || 'pistol';
        player.ammo[ammoType] = (player.ammo[ammoType] || 0) + (item.ammoAmount || 10);
        this.notifications.add(`+${item.ammoAmount} ${ammoType} ammo`, 'loot');
        this.audio.playSound('pickup');
        break;
      default:
        this.notifications.add(`Can't use ${item.name}`, 'warning');
        return; // Don't consume
    }

    // Consume item
    if (item.stackable && item.count > 1) {
      item.count--;
    } else {
      player.inventory.splice(index, 1);
    }
    if (this.selectedInventorySlot >= player.inventory.length) {
      this.selectedInventorySlot = -1;
    }
  }

  dropItem(index) {
    const player = this.player;
    const item = player.inventory[index];
    if (!item) return;
    
    this.lootSystem.dropLoot(player.x, player.y, [item]);
    player.inventory.splice(index, 1);
    this.selectedInventorySlot = -1;
    this.notifications.add(`Dropped ${item.name}`, 'info');
  }

  renderMap(ctx) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('WORLD MAP', this.width / 2, 30);

    // Scale for full map view
    const scale = Math.min(this.width / WORLD_TILES_X, (this.height - 60) / WORLD_TILES_Y) * 0.9;
    const mapX = this.width / 2 - (WORLD_TILES_X * scale) / 2;
    const mapY = 50;

    // Draw tiles (simplified)
    for (let ty = 0; ty < WORLD_TILES_Y; ty += 2) {
      for (let tx = 0; tx < WORLD_TILES_X; tx += 2) {
        const tile = this.world.tiles[ty][tx];
        let color;
        switch (tile) {
          case TILE.ROAD: color = '#333'; break;
          case TILE.WALL: color = '#555'; break;
          case TILE.FLOOR: color = '#444'; break;
          case TILE.SAFEHOUSE: color = '#264'; break;
          default: color = '#1a2a1a'; break;
        }
        ctx.fillStyle = color;
        ctx.fillRect(mapX + tx * scale, mapY + ty * scale, scale * 2 + 0.5, scale * 2 + 0.5);
      }
    }

    // Player position
    const playerTX = this.player.x / TILE_SIZE;
    const playerTY = this.player.y / TILE_SIZE;
    ctx.fillStyle = '#00ff00';
    ctx.beginPath();
    ctx.arc(mapX + playerTX * scale, mapY + playerTY * scale, 4, 0, Math.PI * 2);
    ctx.fill();

    // Zombies (red dots for bosses)
    for (const z of this.entities.zombies) {
      if (z.hp <= 0) continue;
      if (z.isBoss) {
        ctx.fillStyle = '#ff0000';
        ctx.beginPath();
        ctx.arc(mapX + (z.x / TILE_SIZE) * scale, mapY + (z.y / TILE_SIZE) * scale, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Safehouses
    for (const sh of this.world.safehouses) {
      ctx.fillStyle = '#44ff44';
      ctx.fillRect(mapX + (sh.x / TILE_SIZE) * scale - 2, mapY + (sh.y / TILE_SIZE) * scale - 2, 4, 4);
    }

    // Airdrops
    for (const drop of this.airdropSystem.airdrops) {
      if (drop.status === 'landed') {
        ctx.fillStyle = '#ffff00';
        ctx.fillRect(mapX + (drop.x / TILE_SIZE) * scale - 2, mapY + (drop.y / TILE_SIZE) * scale - 2, 4, 4);
      }
    }

    // Legend
    const legendY = this.height - 80;
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#00ff00';
    ctx.fillRect(20, legendY, 8, 8);
    ctx.fillText('You', 32, legendY + 8);
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(70, legendY, 8, 8);
    ctx.fillText('Boss', 82, legendY + 8);
    ctx.fillStyle = '#44ff44';
    ctx.fillRect(130, legendY, 8, 8);
    ctx.fillText('Safehouse', 142, legendY + 8);
    ctx.fillStyle = '#ffff00';
    ctx.fillRect(220, legendY, 8, 8);
    ctx.fillText('Airdrop', 232, legendY + 8);

    ctx.fillStyle = '#666';
    ctx.font = '10px monospace';
    ctx.fillText('[M] or [Esc] to close', 20, this.height - 15);
    ctx.textAlign = 'left';
  }

  renderQuestJournal(ctx) {
    const panelW = 400;
    const panelH = 350;
    const panelX = this.width / 2 - panelW / 2;
    const panelY = this.height / 2 - panelH / 2;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillRect(panelX, panelY, panelW, panelH);
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 2;
    ctx.strokeRect(panelX, panelY, panelW, panelH);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px monospace';
    ctx.fillText('QUEST JOURNAL', panelX + 15, panelY + 28);

    // Active quests
    ctx.fillStyle = '#ffcc00';
    ctx.font = 'bold 12px monospace';
    ctx.fillText('Active Quests:', panelX + 15, panelY + 55);

    let y = panelY + 75;
    for (const quest of this.player.activeQuests) {
      if (quest.completed) continue;
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px monospace';
      ctx.fillText(quest.name, panelX + 20, y);
      ctx.fillStyle = '#aaaaaa';
      ctx.font = '10px monospace';
      ctx.fillText(quest.description, panelX + 20, y + 15);
      ctx.fillStyle = '#44aaff';
      ctx.fillText(`Progress: ${quest.progress}/${quest.target}`, panelX + 20, y + 30);
      ctx.fillStyle = '#ffaa00';
      ctx.fillText(`Reward: ${quest.reward.xp} XP`, panelX + 200, y + 30);
      y += 50;
    }

    // Completed quests
    const completed = this.player.activeQuests.filter(q => q.completed);
    if (completed.length > 0) {
      ctx.fillStyle = '#44ff44';
      ctx.font = 'bold 12px monospace';
      ctx.fillText('Completed:', panelX + 15, y + 10);
      y += 25;
      for (const quest of completed) {
        ctx.fillStyle = '#666';
        ctx.font = '10px monospace';
        ctx.fillText(`✓ ${quest.name}`, panelX + 20, y);
        y += 18;
      }
    }

    if (this.player.activeQuests.length === 0) {
      ctx.fillStyle = '#888';
      ctx.font = '12px monospace';
      ctx.fillText('No active quests', panelX + 15, panelY + 75);
    }

    ctx.fillStyle = '#666';
    ctx.font = '10px monospace';
    ctx.fillText('[J] or [Esc] to close', panelX + 15, panelY + panelH - 15);
  }

  renderDialog(ctx) {
    if (!this.dialogState) { this.state = 'playing'; return; }
    
    const npc = this.dialogState.npc;
    const panelW = 450;
    const panelH = 350;
    const panelX = this.width / 2 - panelW / 2;
    const panelY = this.height / 2 - panelH / 2;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
    ctx.fillRect(panelX, panelY, panelW, panelH);
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 2;
    ctx.strokeRect(panelX, panelY, panelW, panelH);

    // NPC name and faction
    ctx.fillStyle = npc.hostile ? '#ff4444' : '#44aaff';
    ctx.font = 'bold 16px monospace';
    ctx.fillText(npc.name, panelX + 15, panelY + 28);
    ctx.fillStyle = '#888';
    ctx.font = '10px monospace';
    ctx.fillText(`${npc.faction} — ${npc.type}`, panelX + 15, panelY + 43);

    // Greeting
    ctx.fillStyle = '#cccccc';
    ctx.font = '12px monospace';
    const greeting = this.dialogState.dialog.greeting;
    ctx.fillText(greeting.substring(0, 55), panelX + 15, panelY + 70);
    if (greeting.length > 55) ctx.fillText(greeting.substring(55, 110), panelX + 15, panelY + 85);

    // Trust
    ctx.fillStyle = '#ffaa00';
    ctx.font = '10px monospace';
    ctx.fillText(`Trust: ${npc.trust}`, panelX + 15, panelY + 105);

    // Options
    const options = this.dialogState.dialog.options;
    let optY = panelY + 125;
    for (let i = 0; i < options.length; i++) {
      const opt = options[i];
      const optHover = this.input.mouse.x >= panelX + 15 && this.input.mouse.x <= panelX + panelW - 15 &&
                       this.input.mouse.y >= optY - 2 && this.input.mouse.y <= optY + 22;
      const meetsTrust = !opt.trustRequired || npc.trust >= opt.trustRequired;

      ctx.fillStyle = optHover ? 'rgba(255,255,255,0.1)' : 'transparent';
      ctx.fillRect(panelX + 15, optY - 2, panelW - 30, 24);
      ctx.fillStyle = meetsTrust ? '#ffffff' : '#555';
      ctx.font = '12px monospace';
      ctx.fillText(`${i + 1}. ${opt.text}`, panelX + 20, optY + 14);

      if (optHover && this.input.mouse.leftDown && meetsTrust) {
        this.handleDialogOption(opt, npc);
        this.input.mouse.left = false;
      }
      optY += 28;
    }

    // Trade items display
    if (this.tradeItems) {
      const tradeX = panelX + panelW + 10;
      const tradeW = 200;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
      ctx.fillRect(tradeX, panelY, tradeW, panelH);
      ctx.strokeStyle = '#555';
      ctx.strokeRect(tradeX, panelY, tradeW, panelH);
      ctx.fillStyle = '#ffcc00';
      ctx.font = 'bold 12px monospace';
      ctx.fillText('TRADE', tradeX + 10, panelY + 20);

      for (let i = 0; i < this.tradeItems.length; i++) {
        const item = this.tradeItems[i];
        const iy = panelY + 40 + i * 30;
        const itemHover = this.input.mouse.x >= tradeX && this.input.mouse.x <= tradeX + tradeW &&
                          this.input.mouse.y >= iy && this.input.mouse.y <= iy + 28;

        ctx.fillStyle = itemHover ? 'rgba(255,255,255,0.1)' : 'transparent';
        ctx.fillRect(tradeX + 5, iy, tradeW - 10, 28);
        ctx.fillStyle = '#ffffff';
        ctx.font = '10px monospace';
        ctx.fillText(`${item.name} — ${item.price}g`, tradeX + 10, iy + 18);

        if (itemHover && this.input.mouse.leftDown) {
          this.handleTrade(item, npc);
          this.input.mouse.left = false;
        }
      }
    }

    ctx.fillStyle = '#666';
    ctx.font = '10px monospace';
    ctx.fillText('[Esc] to close', panelX + 15, panelY + panelH - 15);
  }

  handleDialogOption(option, npc) {
    switch (option.action) {
      case 'trade':
        this.tradeItems = npc.tradeItems;
        break;
      case 'info':
        const infos = [
          'The hospital has medical supplies but is overrun.',
          'Military checkpoint has heavy weapons. Very dangerous.',
          'Watch out for Screamers. They call reinforcements.',
          'There are safehouses scattered around. Look for green tiles.',
          'Airdrops happen periodically. Follow the signal.',
          'Bosses guard the best loot. Come prepared.',
        ];
        this.notifications.add(randomChoice(infos), 'info', 4);
        npc.trust += 5;
        break;
      case 'give_food':
        const foodIdx = this.player.inventory.findIndex(i => i.type === 'food');
        if (foodIdx >= 0) {
          const food = this.player.inventory[foodIdx];
          if (food.count > 1) food.count--;
          else this.player.inventory.splice(foodIdx, 1);
          npc.trust += option.trustChange || 10;
          this.notifications.add(`${npc.name} appreciates the food. Trust +${option.trustChange}`, 'success');
          this.audio.playSound('pickup');
          // Maybe give quest
          if (npc.questAvailable && npc.quest && npc.trust >= 30 && !this.player.activeQuests.find(q => q.id === npc.quest.id)) {
            this.player.activeQuests.push({ ...npc.quest, id: npc.quest.id || generateId() });
            this.notifications.add(`New Quest: ${npc.quest.name}`, 'quest', 3);
          }
        } else {
          this.notifications.add('No food to give', 'warning');
        }
        break;
      case 'intimidate':
        if (Math.random() < 0.5) {
          npc.hostile = false;
          npc.trust = Math.max(0, npc.trust - 10);
          this.notifications.add(`${npc.name} backs down`, 'success');
        } else {
          npc.hostile = true;
          this.notifications.add(`${npc.name} doesn't back down!`, 'danger');
        }
        this.state = 'playing';
        this.dialogState = null;
        break;
      case 'bribe':
        this.tradeItems = npc.tradeItems; // Use trade as bribe
        npc.trust += option.trustChange || 20;
        if (npc.trust >= 40) {
          npc.hostile = false;
          this.notifications.add(`${npc.name} is no longer hostile`, 'success');
        }
        break;
      case 'fight':
        npc.hostile = true;
        this.state = 'playing';
        this.dialogState = null;
        this.notifications.add(`${npc.name} becomes hostile!`, 'danger');
        break;
      case 'leave':
        this.state = 'playing';
        this.dialogState = null;
        this.tradeItems = null;
        break;
      case 'services':
        if (this.player.hp < this.player.maxHP) {
          const healAmount = Math.min(40, this.player.maxHP - this.player.hp);
          this.player.heal(healAmount);
          this.notifications.add(`Healed ${healAmount} HP`, 'success');
          this.audio.playSound('pickup');
        } else {
          this.notifications.add('Already at full health', 'info');
        }
        break;
    }
  }

  handleTrade(item, npc) {
    // Simple currency: items can be traded for free with high trust, or for "gold"
    // For simplicity, use a trust-based system
    if (npc.trust < 20 && item.price > 10) {
      this.notifications.add('Not enough trust to trade', 'warning');
      return;
    }
    
    // Add item to inventory
    if (this.player.inventory.length >= this.player.maxInventorySlots) {
      this.notifications.add('Inventory full!', 'warning');
      return;
    }

    if (item.type === 'weapon' && item.weapon) {
      this.addToInventory(this.player, { type: 'weapon', weapon: item.weapon, name: item.name });
    } else if (item.type === 'ammo') {
      this.player.ammo['pistol'] = (this.player.ammo['pistol'] || 0) + (item.ammoAmount || 10);
    } else {
      this.addToInventory(this.player, { ...item, stackable: true, count: 1 });
    }
    
    this.audio.playSound('pickup');
    this.notifications.add(`Obtained ${item.name}`, 'loot');
    npc.trust += 3;
  }

  renderCrafting(ctx) {
    const panelW = 400;
    const panelH = 380;
    const panelX = this.width / 2 - panelW / 2;
    const panelY = this.height / 2 - panelH / 2;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillRect(panelX, panelY, panelW, panelH);
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 2;
    ctx.strokeRect(panelX, panelY, panelW, panelH);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px monospace';
    ctx.fillText('CRAFTING', panelX + 15, panelY + 28);

    const recipes = Object.entries(CRAFTING_RECIPES);
    let y = panelY + 50;

    for (const [key, recipe] of recipes) {
      const canMake = canCraft(recipe, this.player.inventory);
      const isSelected = this.selectedCraftRecipe === key;
      const itemHover = this.input.mouse.x >= panelX + 10 && this.input.mouse.x <= panelX + panelW - 10 &&
                        this.input.mouse.y >= y && this.input.mouse.y <= y + 50;

      ctx.fillStyle = isSelected ? 'rgba(100, 100, 255, 0.2)' : (itemHover ? 'rgba(255,255,255,0.05)' : 'transparent');
      ctx.fillRect(panelX + 10, y, panelW - 20, 50);
      ctx.strokeStyle = canMake ? '#44aa44' : '#333';
      ctx.lineWidth = 1;
      ctx.strokeRect(panelX + 10, y, panelW - 20, 50);

      ctx.fillStyle = canMake ? '#ffffff' : '#666';
      ctx.font = 'bold 12px monospace';
      ctx.fillText(recipe.name, panelX + 20, y + 18);

      // Materials
      ctx.fillStyle = '#aaaaaa';
      ctx.font = '9px monospace';
      const matText = recipe.materials.map(m => `${m.name} x${m.count}`).join(', ');
      ctx.fillText(`Needs: ${matText}`, panelX + 20, y + 33);

      // Craft button
      if (isSelected && canMake) {
        const craftX = panelX + panelW - 80;
        const craftHover = this.input.mouse.x >= craftX && this.input.mouse.x <= craftX + 60 &&
                           this.input.mouse.y >= y + 10 && this.input.mouse.y <= y + 40;
        ctx.fillStyle = craftHover ? '#336633' : '#223322';
        ctx.fillRect(craftX, y + 10, 60, 30);
        ctx.fillStyle = '#44ff44';
        ctx.font = 'bold 10px monospace';
        ctx.fillText('CRAFT', craftX + 10, y + 30);

        if (craftHover && this.input.mouse.leftDown) {
          const result = craft(recipe, this.player.inventory);
          if (result) {
            this.addToInventory(this.player, result);
            this.audio.playSound('craft');
            this.notifications.add(`Crafted ${recipe.name}!`, 'success');
          }
          this.input.mouse.left = false;
        }
      }

      if (itemHover && this.input.mouse.leftDown) {
        this.selectedCraftRecipe = isSelected ? null : key;
        this.input.mouse.left = false;
      }
      y += 55;
    }

    ctx.fillStyle = '#666';
    ctx.font = '10px monospace';
    ctx.fillText('[B] or [Esc] to close', panelX + 15, panelY + panelH - 15);
  }

  renderCharStats(ctx) {
    const player = this.player;
    const panelW = 350;
    const panelH = 400;
    const panelX = this.width / 2 - panelW / 2;
    const panelY = this.height / 2 - panelH / 2;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillRect(panelX, panelY, panelW, panelH);
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 2;
    ctx.strokeRect(panelX, panelY, panelW, panelH);

    ctx.fillStyle = player.roleData.color;
    ctx.font = 'bold 18px monospace';
    ctx.fillText(`${player.roleData.icon} ${player.roleData.name}`, panelX + 15, panelY + 28);

    const stats = [
      `Level: ${player.level} (${player.xp}/${player.xpToNextLevel} XP)`,
      `HP: ${Math.ceil(player.hp)} / ${Math.ceil(player.maxHP)}`,
      `Stamina: ${Math.ceil(player.stamina)} / ${Math.ceil(player.staminaMax)}`,
      `Hunger: ${Math.ceil(player.hunger)}/100`,
      `Thirst: ${Math.ceil(player.thirst)}/100`,
      `Move Speed: ${Math.round(player.getEffectiveSpeed())}`,
      `Inventory: ${player.inventory.length}/${player.maxInventorySlots}`,
      `Kills: ${player.stats.kills}`,
      `Boss Kills: ${player.stats.bossKills}`,
      `Items Looted: ${player.stats.itemsLooted}`,
      `Distance: ${Math.round(player.stats.distanceTraveled)}m`,
      `Damage Dealt: ${Math.round(player.stats.damageDealt)}`,
    ];

    let y = panelY + 55;
    ctx.font = '12px monospace';
    for (const stat of stats) {
      ctx.fillStyle = '#cccccc';
      ctx.fillText(stat, panelX + 20, y);
      y += 22;
    }

    // Role bonuses
    y += 10;
    ctx.fillStyle = '#ffcc00';
    ctx.font = 'bold 11px monospace';
    ctx.fillText('Role Bonuses:', panelX + 20, y);
    y += 18;
    ctx.fillStyle = '#88ff88';
    ctx.font = '10px monospace';
    ctx.fillText(player.roleData.passive.name, panelX + 25, y);
    y += 15;
    ctx.fillStyle = '#aaaaaa';
    ctx.fillText(player.roleData.passive.description.substring(0, 48), panelX + 25, y);

    ctx.fillStyle = '#666';
    ctx.font = '10px monospace';
    ctx.fillText('[C] or [Esc] to close', panelX + 15, panelY + panelH - 15);
  }

  renderSettings(ctx) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SETTINGS', this.width / 2, 50);

    const centerX = this.width / 2;
    let y = 90;

    // Volume controls
    ctx.fillStyle = '#cccccc';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Audio', centerX - 120, y);
    y += 25;

    const sliders = [
      { label: 'Master Volume', value: this.audio.masterVolume, key: 'master' },
      { label: 'SFX Volume', value: this.audio.sfxVolume, key: 'sfx' },
      { label: 'Music Volume', value: this.audio.musicVolume, key: 'music' },
    ];

    for (const slider of sliders) {
      ctx.fillStyle = '#aaa';
      ctx.font = '12px monospace';
      ctx.fillText(slider.label, centerX - 120, y);
      
      const barX = centerX + 20;
      const barW = 150;
      ctx.fillStyle = '#333';
      ctx.fillRect(barX, y - 8, barW, 12);
      ctx.fillStyle = '#cc3333';
      ctx.fillRect(barX, y - 8, barW * slider.value, 12);
      ctx.strokeStyle = '#555';
      ctx.strokeRect(barX, y - 8, barW, 12);
      
      ctx.fillStyle = '#fff';
      ctx.font = '10px monospace';
      ctx.fillText(`${Math.round(slider.value * 100)}%`, barX + barW + 5, y);

      // Click to change
      if (this.input.mouse.left && 
          this.input.mouse.x >= barX && this.input.mouse.x <= barX + barW &&
          this.input.mouse.y >= y - 10 && this.input.mouse.y <= y + 6) {
        slider.value = clamp((this.input.mouse.x - barX) / barW, 0, 1);
        this.audio.setVolume(slider.key, slider.value);
      }
      y += 25;
    }

    y += 20;
    ctx.fillStyle = '#cccccc';
    ctx.font = 'bold 14px monospace';
    ctx.fillText('Controls', centerX - 120, y);
    y += 25;
    ctx.fillStyle = '#aaa';
    ctx.font = '11px monospace';
    const controlsList = [
      'WASD: Move | Mouse: Aim | LMB: Shoot',
      'R: Reload | E/F: Interact | Q: Skill',
      '1-5: Weapons | Tab: Inventory | M: Map',
      'J: Quests | C: Stats | B: Craft | Esc: Pause',
      'Shift: Sprint | RMB: Precision Aim',
    ];
    for (const line of controlsList) {
      ctx.fillText(line, centerX - 120, y);
      y += 18;
    }

    // Back button
    y += 30;
    const backHover = this.input.mouse.x >= centerX - 50 && this.input.mouse.x <= centerX + 50 &&
                      this.input.mouse.y >= y - 5 && this.input.mouse.y <= y + 25;
    ctx.fillStyle = backHover ? '#444' : '#222';
    ctx.fillRect(centerX - 50, y - 5, 100, 30);
    ctx.strokeStyle = '#cc3333';
    ctx.strokeRect(centerX - 50, y - 5, 100, 30);
    ctx.fillStyle = '#fff';
    ctx.font = '14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('BACK', centerX, y + 15);

    if (backHover && this.input.mouse.leftDown) {
      this.state = this.player ? 'paused' : 'menu';
      this.input.mouse.left = false;
    }
    if (this.justPressed('Escape')) {
      this.state = this.player ? 'paused' : 'menu';
    }
    ctx.textAlign = 'left';
  }

  renderDeathScreen(ctx) {
    ctx.fillStyle = 'rgba(50, 0, 0, 0.8)';
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.fillStyle = '#cc3333';
    ctx.font = 'bold 48px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('YOU DIED', this.width / 2, this.height * 0.3);

    ctx.fillStyle = '#aaa';
    ctx.font = '14px monospace';
    ctx.fillText(`Level: ${this.player.level}`, this.width / 2, this.height * 0.4);
    ctx.fillText(`Kills: ${this.player.stats.kills}`, this.width / 2, this.height * 0.43);
    ctx.fillText(`Boss Kills: ${this.player.stats.bossKills}`, this.width / 2, this.height * 0.46);
    ctx.fillText(`Time Survived: ${formatTime(this.gameTime)}`, this.width / 2, this.height * 0.49);

    const buttons = [
      { label: 'RESPAWN', action: () => {
        // Respawn at safehouse
        const sh = this.world.safehouses[0];
        this.player.x = sh ? sh.x : WORLD_WIDTH / 2;
        this.player.y = sh ? sh.y : WORLD_HEIGHT / 2;
        this.player.hp = this.player.maxHP * 0.5;
        this.player.alive = true;
        this.player.hunger = 50;
        this.player.thirst = 50;
        this.player.stamina = this.player.staminaMax;
        this.state = 'playing';
        this.notifications.add('Respawned at safehouse', 'info');
      }},
      { label: 'MAIN MENU', action: () => { this.state = 'menu'; } },
    ];

    for (let i = 0; i < buttons.length; i++) {
      const btn = buttons[i];
      const btnW = 200;
      const btnH = 40;
      const bx = this.width / 2 - btnW / 2;
      const by = this.height * 0.55 + i * 50;
      const isHover = this.input.mouse.x >= bx && this.input.mouse.x <= bx + btnW &&
                      this.input.mouse.y >= by && this.input.mouse.y <= by + btnH;

      ctx.fillStyle = isHover ? '#442222' : '#221111';
      ctx.fillRect(bx, by, btnW, btnH);
      ctx.strokeStyle = '#cc3333';
      ctx.strokeRect(bx, by, btnW, btnH);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px monospace';
      ctx.fillText(btn.label, this.width / 2, by + btnH / 2 + 6);

      if (isHover && this.input.mouse.leftDown) {
        btn.action();
        this.input.mouse.left = false;
      }
    }

    ctx.textAlign = 'left';
  }
}