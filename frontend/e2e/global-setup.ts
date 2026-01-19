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
         if ('serviceWorker' in navigator) {
           try {
             let regs = await navigator.serviceWorker.getRegistrations();
             for (const r of regs) {
               try {
                 await r.unregister();
               } catch {
                 // Silent failure - ignore
               }
             }
             // give the browser a moment to settle
             await new Promise((res) => setTimeout(res, 100));
             regs = await navigator.serviceWorker.getRegistrations();
           } catch {
             // Silent failure - ignore
           }
         }

         if ('caches' in window) {
           try {
             const keys = await caches.keys();
             for (const k of keys) {
               try {
                 await caches.delete(k);
               } catch {
                 // Silent failure - ignore
               }
             }
           } catch {
             // Silent failure - ignore
           }
         }

         // Log IndexedDB databases when available for diagnostics (do not attempt destructive actions)
         if (typeof indexedDB !== 'undefined' && 'databases' in indexedDB) {
           try {
             // @ts-ignore
             await indexedDB.databases();
           } catch {
             // Silent failure - ignore
           }
         }
       } catch {
         // Silent failure - ignore
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
