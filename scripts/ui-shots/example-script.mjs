// An example for --script: real pointer and key input against a 3D view.
//   node scripts/ui-shots/shots.mjs --url http://localhost:5214 --out ui-after-shots --sizes 1440x900 --script scripts/ui-shots/example-script.mjs

export default async function (page) {
  await page.seed('late')
  await page.eval(`H.tab('city')`)
  await page.settle({ gl: true })
  await page.shot('example-1-city')

  // drag across the middle of the 3D view to turn the camera, then zoom in
  const box = await page.eval(`H.canvas()`)
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  await page.drag(cx - 150, cy, cx + 150, cy, { steps: 20 })
  await page.wheel(cx, cy, -360)
  await page.settle({ gl: true })
  await page.shot('example-2-city-turned')

  // a key the game listens for, then what the store says
  await page.key('F1')
  await page.wait(300)
  console.log('tab after F1:', await page.eval(`sb.getState().tab`))
  const { textNodes, numerals, controls } = await page.metrics()
  console.log('density:', { textNodes, numerals, controls })
}
