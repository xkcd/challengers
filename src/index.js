import Comic from './Comic'

import comicOptions from './comicOptions'

const baseURL = '/2067/asset/'

async function main() {
  const comic = new Comic({
    ...comicOptions,
    baseURL,
  })
  const canvasEl = comic.create()
  const comicContent = document.getElementById('comic-content')
  comicContent.parentNode.replaceChild(canvasEl, comicContent)

  const resp = await fetch(`${baseURL}map-data.json`)
  const data = await resp.json()

  if (document.fonts) {
    await document.fonts.load('normal 12px xkcd-Regular-v2')
  }

  comic.run(data)
}

document.addEventListener('DOMContentLoaded', main)
