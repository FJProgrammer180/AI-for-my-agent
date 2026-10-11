# LAST SIGNAL: DEAD ZONE

**Top-Down 2D Zombie Survival Shooter**

A complete, playable browser-based survival game built with HTML5 Canvas and vanilla JavaScript.

---

## 🎮 How to Run

1. **Start the server:**
   ```bash
   node server.js
   ```

2. **Open your browser:**
   Navigate to `http://localhost:3000`

3. **Play!**

---

## 🕹️ Controls

| Key | Action |
|-----|--------|
| `W/A/S/D` | Move |
| `Mouse` | Aim |
| `Left Click` | Shoot / Attack |
| `Right Click` | Precision Aim |
| `R` | Reload |
| `E` or `F` | Interact / Pick up |
| `Q` | Activate Skill |
| `1-5` | Switch Weapon Slot |
| `Tab` | Inventory |
| `M` | Map |
| `J` | Quest Journal |
| `C` | Character Stats |
| `B` | Crafting |
| `Shift` | Sprint |
| `Esc` | Pause / Menu |

**Touch Controls (Mobile):**
- Left side: Virtual joystick for movement
- Right side: Touch to aim and shoot

---

## 🎭 Playable Roles

### The Hacker 💻
- **Specialty:** Technology, drones, melee combat
- **Skill:** Remote Override — Hack robotic enemies (65% success rate, 15s duration)
- **Passive:** +15% melee damage, +10% melee lifesteal, +20% sprint speed
- **Weakness:** -20% max HP

### The Killer 💀
- **Specialty:** Chain eliminations, high risk/reward
- **Skill:** First Blood — 30% chance on kill to activate: 2x damage, +60% speed, immune to regular attacks for 20s
- **Passive:** +15% speed, +30% Legendary weapon damage, +30% max HP
- **Weakness:** Speed penalty after kills, Berserk risk when stunned

### The Soldier 🎖️
- **Specialty:** Firearms, sustained combat, suppression
- **Skill:** Suppressive Fire — 8s: -35% recoil/spread, +25% reload speed
- **Passive:** +10% firearm damage, +15% reload speed, +20% ammo loot
- **Weakness:** -10% sprint speed, heavy weapon penalty

---

## 🌍 World

The game features a procedurally generated urban zone with multiple districts:

1. **Residential District** — Houses, alleys, backyards
2. **Commercial District** — Shops, restaurants, warehouses
3. **Downtown** — Office buildings, abandoned vehicles, dense zombies
4. **Hospital** — Medical supplies, infection risk
5. **Police Station** — Weapons, ammo, armor
6. **Military Checkpoint** — Rare ammo, tactical gear, high danger
7. **Industrial Zone** — Crafting materials, tough enemies
8. **Safehouses** — Storage, crafting, rest points
9. **Evacuation Zone** — Mission destination

### Day/Night Cycle
- **Day:** Normal zombie behavior
- **Night:** Increased zombie detection range, faster movement, more dangerous types spawn

---

## ⚔️ Weapons

### Melee (7 types)
- Combat Knife, Baseball Bat, Machete, Katana, Crowbar, Tactical Axe, Sledgehammer
- Each has unique attack arc, speed, damage, and knockback

### Ranged (9 types)
- Pistol, Revolver, MP5, AK-47, Shotgun, Assault Rifle, Sniper Rifle, LMG, Crossbow
- Full ammo system with magazine reload, spread, recoil

### Heavy (2 types)
- Grenade Launcher, Rocket Launcher
- Area-of-effect damage, self-harm risk, rare ammo

### Rarity System
- Common → Uncommon → Rare → Epic → Legendary
- Higher rarity = better stats and effects

---

## 🧟 Zombie Types

| Type | Speed | Special |
|------|-------|---------|
| Walker | Slow | Basic enemy |
| Runner | Fast | Chases you down |
| Brute | Slow | High HP, armor |
| Screamer | Medium | Calls reinforcements |
| Spitter | Medium | Ranged acid attack |
| Armored | Slow | High damage resistance |
| Mutated | Medium | Regenerates HP |
| Radiated | Medium | Radiation damage aura |
| Elite | Fast | Multiple abilities |

### Boss Zombies

**RADBRUTE — The Irradiated Colossus**
- 2000 HP, multiple phases, radiation attacks, charge attack

**TOXIC SCREAMER — The Plague Herald**
- 1200 HP, summons minions, toxic wave attacks

**ALPHA OVERLORD — The Last Mutation**
- 3500 HP, 5 attack patterns, vulnerability windows, berserker rage

---

## 🎒 Systems

### Inventory
- Slot-based inventory with capacity limit
- Stackable items, equipment, weapons
- Drop, use, and equip items

### Survival
- HP, Hunger, Thirst, Stamina
- Bleeding and Infection status effects
- Starvation and dehydration damage

### Crafting
- Bandage, Medical Kit, Ammo Pouch, Barricade, Repair Kit, Improvised Weapon
- Material-based recipes with validation

### Airdrops
- Periodic supply drops with rare loot
- Marked on minimap, contested by zombies
- Status: Incoming → Landed → Looted/Expired

### NPCs
- Friendly, Neutral, Hostile, Specialist types
- Dialogue system with trust/reputation
- Trading and quest givers

### Save System
- LocalStorage-based persistence
- Autosave every 60 seconds
- Manual save from pause menu

---

## 📁 Project Structure

```
AI-for-my-agent/
├── index.html              — Entry point
├── styles.css              — UI styling
├── server.js               — Development server
├── src/
│   ├── main.js             — Game initialization
│   ├── core/
│   │   ├── utils.js        — Math, collision, random utilities
│   │   └── Game.js         — Main game engine (all systems)
│   └── data/
│       ├── weapons.js      — Weapon definitions
│       ├── classes.js      — Role/class definitions
│       └── zombies.js      — Zombie type definitions
```

---

## 📊 Features Summary

✅ Procedurally generated city with 9 districts  
✅ 3 playable roles with unique skills  
✅ 18 weapon types with full mechanics  
✅ 9+ zombie types + 3 boss fights  
✅ Full inventory system  
✅ Survival mechanics (hunger, thirst, stamina)  
✅ Day/night cycle  
✅ NPC dialogue and trading  
✅ Quest system  
✅ Airdrop events  
✅ Crafting system  
✅ Minimap and full map  
✅ Save/Load with autosave  
✅ Touch controls for mobile  
✅ Procedural audio feedback  
✅ Particle effects  
✅ Boss phases and vulnerability windows  

---

## 🐛 Known Limitations

- Audio uses synthesized tones (Web Audio API) — no asset-based sound files
- Visual style uses geometric shapes — no sprite sheet art
- Single-player only
- Map generation is seeded but fixed after creation
- No multiplayer or networking

---

## 📝 License

See LICENSE file.