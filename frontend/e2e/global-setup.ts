/**
 * Global setup for Playwright tests
 * 
 * This file runs once before all tests and sets up any global state.
 */

import { chromium, FullConfig } from '@playwright/test';

async function globalSetup(config: FullConfig) {
  // Create a browser context to set up localStorage
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // Navigate to the app to set localStorage
   const baseURL = config.projects[0]?.use?.baseURL || 'http://localhost:5173';
   await page.goto(baseURL);
   
    // Aggressively unregister service workers, clear caches, and log diagnostics to traces
    await page.evaluate(async () => {
      try {
        console.log('[global-setup] Starting service worker and cache cleanup');
        if ('serviceWorker' in navigator) {
          try {
            let regs = await navigator.serviceWorker.getRegistrations();
            console.log('[global-setup] service worker registrations before:', regs.map(r => ({scope: r.scope, scriptURL: r.scriptURL}))); 
            for (const r of regs) {
              try {
                const ok = await r.unregister();
                console.log('[global-setup] unregistered', r.scope, ok);
              } catch (err) {
                console.log('[global-setup] unregister error', r.scope, String(err));
              }
            }
            // give the browser a moment to settle
            await new Promise((res) => setTimeout(res, 100));
            regs = await navigator.serviceWorker.getRegistrations();
            console.log('[global-setup] service worker registrations after:', regs.map(r => ({scope: r.scope, scriptURL: r.scriptURL}))); 
          } catch (err) {
            console.log('[global-setup] error enumerating/unregistering service workers', String(err));
          }
        } else {
          console.log('[global-setup] serviceWorker not supported in navigator');
        }

        if ('caches' in window) {
          try {
            const keys = await caches.keys();
            console.log('[global-setup] cache keys before:', keys);
            for (const k of keys) {
              try {
                const c = await caches.open(k);
                const requests = await c.keys();
                console.log('[global-setup] cache', k, 'entries', requests.length);
              } catch (err) {
                console.log('[global-setup] error reading cache', k, String(err));
              }
              await caches.delete(k);
              console.log('[global-setup] deleted cache', k);
            }
            const keysAfter = await caches.keys();
            console.log('[global-setup] cache keys after:', keysAfter);
          } catch (err) {
            console.log('[global-setup] error enumerating/deleting caches', String(err));
          }
        } else {
          console.log('[global-setup] caches not supported in window');
        }

        // Log IndexedDB databases when available for diagnostics (do not attempt destructive actions)
        if (typeof indexedDB !== 'undefined' && 'databases' in indexedDB) {
          try {
            // @ts-ignore
            const dbs = await indexedDB.databases();
            console.log('[global-setup] indexedDB databases:', dbs.map(d => ({name: d.name, version: d.version}))); 
          } catch (err) {
            console.log('[global-setup] error enumerating indexedDB databases', String(err));
          }
        } else {
          console.log('[global-setup] indexedDB.databases not available');
        }

        console.log('[global-setup] cleanup complete');
      } catch (err) {
        console.log('[global-setup] unexpected error during cleanup', String(err));
      }
    });
   
   // Set onboarding complete so it doesn't block tests
   await page.evaluate(() => {
     localStorage.setItem('sudoku_onboarding_complete', 'true');
   });
   
   // Save storage state
   await context.storageState({ path: 'e2e/.auth/storage-state.json' });
   
   await browser.close();
 }


export default globalSetup;
