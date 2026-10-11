// main.js — Entry point for LAST SIGNAL: DEAD ZONE
import { Game } from './core/Game.js';

// Wait for DOM
window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('gameCanvas');
  if (!canvas) {
    console.error('Canvas element not found!');
    return;
  }

  // Initialize game
  const game = new Game(canvas);
  window.game = game; // debug access
  game.init();

  // Hide loading message
  document.body.classList.add('loaded');

  console.log('LAST SIGNAL: DEAD ZONE — Initialized');
  console.log('Controls: WASD to move, Mouse to aim, Click to shoot');
  console.log('E/F to interact, Tab for inventory, M for map, Esc for pause');
});