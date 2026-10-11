// classes.js — Character role definitions for LAST SIGNAL: DEAD ZONE

export const BASE_STATS = {
  maxHP: 100,
  moveSpeed: 160,       // pixels per second
  sprintSpeed: 260,
  staminaMax: 100,
  staminaRegen: 12,     // per second while not sprinting
  staminaDrain: 25,     // per second while sprinting
  hungerRate: 0.15,     // per second
  thirstRate: 0.2,      // per second
  inventorySlots: 20,
  armorSlot: 1,
};

export const ROLES = {
  hacker: {
    id: 'hacker',
    name: 'The Hacker',
    icon: '💻',
    description: 'Technology specialist. Can hack drones and robots. Fast and deadly in melee.',
    color: '#00ccff',
    stats: {
      maxHP: BASE_STATS.maxHP * 0.8,         // -20%
      moveSpeed: BASE_STATS.moveSpeed * 1.0,  // normal
      sprintSpeed: BASE_STATS.sprintSpeed * 1.2,  // +20%
      staminaMax: BASE_STATS.staminaMax,
      staminaRegen: BASE_STATS.staminaRegen,
      staminaDrain: BASE_STATS.staminaDrain,
      hungerRate: BASE_STATS.hungerRate,
      thirstRate: BASE_STATS.thirstRate,
      inventorySlots: BASE_STATS.inventorySlots,
    },
    bonuses: {
      meleeDamage: 0.15,        // +15% melee damage
      meleeLifesteal: 0.10,     // 10% lifesteal on melee
      hackSuccessRate: 0.65,    // 65% base hack chance
    },
    weaknesses: {
      maxHPReduction: 0.20,
    },
    skill: {
      name: 'Remote Override',
      description: 'Attempt to hack a robotic enemy. 65% success rate. Hacked units fight for you for 15s.',
      cooldown: 30,
      duration: 15,
      type: 'active',
      icon: '🔧',
    },
    passive: {
      name: 'Improvised Combat',
      description: '+15% melee damage, +10% melee lifesteal, +20% sprint speed, -20% max HP',
      type: 'passive',
      icon: '⚡',
    },
  },

  killer: {
    id: 'killer',
    name: 'The Killer',
    icon: '💀',
    description: 'Chain elimination specialist. High risk, high reward. First Blood activates on kills.',
    color: '#ff3333',
    stats: {
      maxHP: BASE_STATS.maxHP * 1.3,         // +30%
      moveSpeed: BASE_STATS.moveSpeed * 1.15, // +15%
      sprintSpeed: BASE_STATS.sprintSpeed * 1.15,
      staminaMax: BASE_STATS.staminaMax,
      staminaRegen: BASE_STATS.staminaRegen,
      staminaDrain: BASE_STATS.staminaDrain,
      hungerRate: BASE_STATS.hungerRate,
      thirstRate: BASE_STATS.thirstRate,
      inventorySlots: BASE_STATS.inventorySlots,
    },
    bonuses: {
      legendaryDamage: 0.30,   // +30% damage with legendary weapons
      firstBloodChance: 0.30,  // 30% chance to trigger First Blood on kill
    },
    weaknesses: {
      killSpeedPenalty: 0.40,      // -40% speed for 2s after kill
      killSpeedPenaltyDuration: 2,
      berserkOnStun: true,          // can go berserk when stunned
      berserkDuration: 3,
    },
    skill: {
      name: 'First Blood',
      description: '30% chance on kill: 2x damage, +60% speed, immune to regular attacks for 20s. Boss damage reduced 70%.',
      cooldown: 45,
      duration: 20,
      type: 'passive-trigger',
      icon: '🩸',
      triggerChance: 0.30,
      damageMultiplier: 2.0,
      speedMultiplier: 1.6,
      bossDamageReduction: 0.70,
    },
    passive: {
      name: 'Predator Instinct',
      description: '+15% base speed, +30% Legendary weapon damage, +30% max HP',
      type: 'passive',
      icon: '🐺',
    },
  },

  soldier: {
    id: 'soldier',
    name: 'The Soldier',
    icon: '🎖️',
    description: 'Firearms specialist. Excels at sustained combat and suppression tactics.',
    color: '#55aa44',
    stats: {
      maxHP: BASE_STATS.maxHP,
      moveSpeed: BASE_STATS.moveSpeed,
      sprintSpeed: BASE_STATS.sprintSpeed * 0.90,  // -10% sprint
      staminaMax: BASE_STATS.staminaMax,
      staminaRegen: BASE_STATS.staminaRegen,
      staminaDrain: BASE_STATS.staminaDrain,
      hungerRate: BASE_STATS.hungerRate,
      thirstRate: BASE_STATS.thirstRate,
      inventorySlots: BASE_STATS.inventorySlots * 0.85, // slightly smaller
    },
    bonuses: {
      rangedDamage: 0.10,         // +10% firearm damage
      reloadSpeed: 0.15,          // +15% reload speed
      ammoLootBonus: 0.20,        // +20% ammo from loot
    },
    weaknesses: {
      sprintSpeedPenalty: 0.10,
      heavyWeaponMobilityPenalty: true,
    },
    skill: {
      name: 'Suppressive Fire',
      description: '8 seconds: -35% recoil/spread, +25% reload speed. Enemies may be suppressed.',
      cooldown: 25,
      duration: 8,
      type: 'active',
      icon: '🔥',
      recoilReduction: 0.35,
      spreadReduction: 0.35,
      reloadBonus: 0.25,
      suppressionChance: 0.50,
    },
    passive: {
      name: 'Combat Training',
      description: '+10% firearm damage, +15% reload speed, +20% ammo loot',
      type: 'passive',
      icon: '🎯',
    },
  },
};

export function getRole(id) {
  return ROLES[id] || null;
}

export function getRoleList() {
  return Object.values(ROLES);
}