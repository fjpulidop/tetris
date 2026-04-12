/**
 * PixiJS v8 Application initialization.
 *
 * Uses the v8 async init pattern: new Application() + await app.init({...}).
 * Do NOT use the v7 constructor pattern.
 * The canvas element is passed in from the DOM — we do NOT create a new one.
 */

import { Application } from 'pixi.js'

/**
 * Initialize a PixiJS v8 Application on the given canvas element.
 *
 * PixiJS auto-detects the best renderer: WebGPU → WebGL2 → Canvas 2D.
 * Resolution is clamped to 2 to avoid excessive fill rate on HiDPI mobile.
 *
 * @param canvas - The existing <canvas> element from the DOM
 * @returns Initialized Application instance
 */
export async function createPixiApp(canvas: HTMLCanvasElement): Promise<Application> {
  const app = new Application()

  await app.init({
    canvas,
    resizeTo: window,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio, 2),
    backgroundColor: 0x0a0a0f,
  })

  // Log renderer type in development to confirm WebGL/WebGPU/Canvas
  console.log(`PixiJS renderer type: ${app.renderer.type}`)

  return app
}
