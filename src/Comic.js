import {select, event as d3event} from 'd3-selection'
import {geoPath} from 'd3-geo'
import {zoom, zoomIdentity, zoomTransform} from 'd3-zoom'
import * as topojson from 'topojson'
import Flatbush from 'flatbush'


export default class Comic {
  width = 960
  height = 600

  constructor(options = {}) {
    this.options = options
    this.canvasEl = null
    this.ctx = null
    this.geoPath = null
    this.data = null
    this.objIndex = null
    this.tree = null
    this.imgs = new Map()
  }

  create() {
    const {width, height} = this
    const {devicePixelRatio} = window
    const canvasEl = this.canvasEl = document.createElement('canvas')

    canvasEl.width = width * devicePixelRatio
    canvasEl.height = height * devicePixelRatio
    canvasEl.style.width = `${width}px`
    canvasEl.style.height = `${height}px`
    canvasEl.style.border = '2px solid black'
    canvasEl.style.boxSizing = 'border-box'
    canvasEl.title = this.options.title

    const ctx = this.ctx = canvasEl.getContext('2d', {alpha: false})
    ctx.scale(devicePixelRatio, devicePixelRatio)
    this.drawClear()

    this.geoPath = geoPath().context(ctx)

    return canvasEl
  }

  run(data) {
    this.data = data

    const {maxZoom} = this.options
    const {geometries: objs} = data.objects.objs
    const objIndex = this.objIndex = []
    const tree = this.tree = new Flatbush(objs.length)
    for (const label of objs) {
      const {x, y, w, th} = label.properties.pos
      tree.add(x, y, x + w, y + th)
      objIndex.push(label)
    }
    tree.finish()

    select(this.canvasEl)
      .call(
        zoom()
          .scaleExtent([1, maxZoom])
          .on('zoom', this.handleZoom)
          .on('start', this.handleGrab)
          .on('end', this.handleRelease)
      )
      .on('mousemove', this.handleMouseMove)
      .on('click', this.handleMouseClick)

    this.draw()
  }

  findUnderCursor(event) {
    const {canvasEl, objIndex, tree} = this

    const transform = zoomTransform(canvasEl)
    const x = transform.invertX(event.offsetX)
    const y = transform.invertY(event.offsetY)

    const idxes = tree.search(x, y, x, y)

    return idxes.map(idx => objIndex[idx])
  }

  handleZoom = () => {
    this.handleGrab()
    this.draw()
  }

  handleGrab = () => {
    const {canvasEl} = this
    const event = d3event.sourceEvent
    const buttons = event && event.buttons
    if (buttons === 1 && !this.findUnderCursor(event).length) {
      canvasEl.style.cursor = 'grab'
    }
  }

  handleRelease = () => {
    const {canvasEl} = this
    canvasEl.style.cursor = 'default'
  }

  handleMouseMove = () => {
    const {canvasEl} = this
    const hovers = this.findUnderCursor(d3event)
    const hasURL = hovers.length && hovers[0].properties.url
    canvasEl.style.cursor = hasURL ? 'pointer' : 'default'
  }

  handleMouseClick = () => {
    const hovers = this.findUnderCursor(d3event)
    if (!hovers.length) {
      return
    }

    const {url} = hovers[0].properties
    if (url) {
      window.open(url)
    }
  }

  drawClear() {
    const {ctx, width, height} = this
    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, width, height)
  }

  drawText(text, x, y, w, h) {
    const {canvasEl, ctx} = this
    const {k: zoom} = zoomTransform(canvasEl)
    const zoomedH = h * zoom
    if (zoomedH < .25) {
      return false
    } else if (zoomedH > 2.65) {
      // On Linux Chrome, font sizes less than 8 are offset vertically by what
      // seems to be a random amount. This might be a hinting or metric rounding
      // issue. To work around it, we render a larger font size with a transform
      // that scales it down.
      const factor = 64 / h
      ctx.scale(1 / factor, 1 / factor)
      ctx.font = `normal 64px xkcd-Regular-v2`
      ctx.fillText(text.toLowerCase(), x * factor, y * factor)
      ctx.scale(factor, factor)
      return true
    } else {
      const origAlpha = ctx.globalAlpha
      ctx.globalAlpha *= .65
      ctx.fillRect(x, y + h / 3, w, h / 3)
      ctx.globalAlpha = origAlpha
      return true
    }
  }

  getImage(name, onLoad) {
    const {options} = this
    const {baseURL} = options

    const img = new Image()
    img.onload = onLoad
    img.src = `${baseURL}imgs/${name}.png`
    return img
  }

  drawImage(name, x, y, w, h) {
    const {canvasEl, ctx, imgs, options, draw} = this
    const {baseURL} = options
    const {k: zoom} = zoomTransform(canvasEl)

    const area = w * h

    if (area * zoom < 16) {
      return
    }

    let img = imgs.get(name)
    if (!img) {
      img = this.getImage(name, draw)
      imgs.set(name, img)
    }

    if (img.complete) {
      try {
        ctx.drawImage(img, x, y, w, h)
      } catch (err) {
        console.warn('unable to render img', name, img)
      }
    }
  }

  draw = () => {
    const {options, objIndex, canvasEl, data, ctx, width, height, tree, geoPath} = this
    const {lineSpace, lineWidth, linePadding} = options
    const transform = zoomTransform(canvasEl)

    ctx.save()

    this.drawClear()

    ctx.translate(transform.x, transform.y)
    ctx.scale(transform.k, transform.k)

    ctx.lineJoin = 'round'
    ctx.lineWidth = 1 / transform.k
    const darkness = .18 + .82 / transform.k
    ctx.strokeStyle = `rgba(0, 0, 0, ${darkness})`

    ctx.beginPath()
    geoPath(topojson.mesh(data, data.objects.states, (a, b) => a !== b))
    geoPath(topojson.feature(data, data.objects.nation))
    ctx.stroke()

    const idxsInFrame = tree.search(
      transform.invertX(0),
      transform.invertY(0),
      transform.invertX(width),
      transform.invertY(height),
    )

    for (const idx of idxsInFrame) {
      const obj = objIndex[idx]
      if (obj.properties.kind !== 'comic') {
        continue
      }

      const {id} = obj
      const {pos} = obj.properties
      const {x, y, w, th} = pos
      this.drawImage(id, x, y, w, th)
    }

    for (const idx of idxsInFrame) {
      const obj = objIndex[idx]
      if (obj.properties.kind !== 'label') {
        continue
      }

      const {color, name, caption, pos} = obj.properties
      const {x, y, w, h, cw, ch, aw} = pos

      ctx.fillStyle = color

      ctx.textBaseline = 'top'
      if (!this.drawText(name, x, y, w, h)) {
        // Text is tiny; no need to worry about smaller bits.
        continue
      }

      if (caption) {
        this.drawText(caption, x, y + h, cw, ch)
      }
    }

    ctx.restore()
  }
}
