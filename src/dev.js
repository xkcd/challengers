import Comic from './Comic'

import comicOptions from './comicOptions'
import scaleOptions from './scaleOptions'
import {parseOptions} from './options'
import {calculateLayout} from './layout'

let resolveData
window.layoutTopoJSON = new Promise(resolve => {
  resolveData = resolve
})

async function main() {
  console.log('Comic initializing...')

  if (document.fonts) {
    await document.fonts.load('12px xkcd-Regular-v2')
    console.log('Font loaded.')
  }

  const options = parseOptions(window.location.hash)
  const fullOptions = {
    ...comicOptions,
    ...scaleOptions,
    ...options,
  }
  console.log('Rendering options:', options)

  const comic = new Comic(fullOptions)
  const canvasEl = comic.create()
  const comicContent = document.getElementById('comic-content')
  comicContent.parentNode.replaceChild(canvasEl, comicContent)

  console.log('Calculating layout...')
  const data = await calculateLayout(comic, fullOptions)
  console.log('Layout calculation finished.', data)

  resolveData(data)

  comic.run(data)
}

document.addEventListener('DOMContentLoaded', main)
