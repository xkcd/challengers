import {sortBy, includes, mapValues} from 'lodash'
import {geoPath} from 'd3-geo'
import topology from 'topojson-server'
import rbush from 'rbush'

import usData from '../data/dist/map-states-topo.json'
import labelData from '../data/dist/labels.json'
import imgData from '../data/dist/imgs.json'

import {roundPrecision} from './utils'

function center(rect) {
  return [
    rect.minX + (rect.maxX - rect.minX) / 2,
    rect.minY + (rect.maxY - rect.minY) / 2,
  ]
}

function distance(a, b) {
  return Math.sqrt(Math.pow(b[0] - a[0], 2) + Math.pow(b[1] - a[1], 2))
}

function rectToKey(rect) {
  return `${rect.minX}:${rect.maxX}:${rect.minY}:${rect.maxY}`
}

function calculateScale(options, id, scale) {
  const {b, m, q} = options
  const idParts = id.split('-')
  const idBase = options[`b${idParts[0]}`] || b
  const idScale = options[`m${idParts[0]}`] || m
  const idScale2 = options[`m-${idParts[1]}`] || 1
  return idBase + roundPrecision(idScale * idScale2 * scale, q)
}

function measureText(ctx, height, text) {
  if (!text) {
    return 0
  }
  const factor = 64 / height
  ctx.font = `normal 64px xkcd-Regular-v2`
  const {width} = ctx.measureText(text.toLowerCase())
  return width / factor
}

export async function calculateLayout(comic, scaleOptions) {
  const {imgScale, spacingFactor} = comic.options

  const {ctx} = comic
  const resultTopoJSON = {...usData}

  const objGeometries = []
  resultTopoJSON.objects.objs = {
    type: 'GeometryCollection',
    geometries: objGeometries,
  }

  const tree = new rbush()

  // Position images first.
  for (const d of imgData.features) {
    const [x, y] = d.geometry.coordinates
    const {name} = d.properties
    const loadedImg = await new Promise(resolve => {
      const img = comic.getImage(name, () => resolve(img))
    })

    const w = imgScale * loadedImg.naturalWidth
    const h = imgScale * loadedImg.naturalHeight

    const pos = {
      x: x - w / 2,
      y: y - h / 2,
      w,
      th: h,
    }

    const spacing = spacingFactor * pos.th

    tree.insert({
      minX: pos.x -  2 * spacing,
      maxX: pos.x + pos.w + 2 * spacing,
      minY: pos.y - spacing,
      maxY: pos.y + pos.th + spacing,
    })

    objGeometries.push({
      id: name,
      ...d.geometry,
      properties: {
        kind: 'comic',
        pos,
      },
    })
  }

  // Then position labels.
  const scale = d => calculateScale(scaleOptions, d.id, d.properties.scale)
  const labelPriority = new Map([['City', 1], ['Wiki', 3]])

  const sortedFeatures = sortBy(
    labelData.features.filter(d => d.geometry),
    [
      d => labelPriority.get(d.id.split('-')[0]) || 2,
      d => -scale(d),
      d => -d.properties.length || 0,
    ],
  )

  for (const d of sortedFeatures) {
    const [x, y] = d.geometry.coordinates
    const height = scale(d)
    const nameWidth = measureText(ctx, height, d.properties.name)

    const captionHeight = height / 3
    let totalHeight = height

    if (d.properties.caption) {
      totalHeight += captionHeight
    }
    const captionWidth = measureText(ctx, captionHeight, d.properties.caption)

    const width = Math.max(nameWidth, captionWidth)

    const startRect = {
      minX: x - width / 2,
      maxX: x + width / 2,
      minY: y - height / 2,
      maxY: y + height / 2 + (totalHeight - height),
    }

    const spacingFudge = .01
    const startCenter = center(startRect)
    let candidate = null
    let candidateDist = Infinity
    const seenRects = new Set()
    const queue = [startRect]

    while (queue.length) {
      const rect = queue.shift()

      const rectDist = distance(startCenter, center(rect))
      if (rectDist > candidateDist) {
        continue
      }

      const collisions = tree.search({
        minX: rect.minX + spacingFudge,
        maxX: rect.maxX - spacingFudge,
        minY: rect.minY + spacingFudge,
        maxY: rect.maxY - spacingFudge,
      })
      if (!collisions.length) {
        candidate = rect
        candidateDist = rectDist
      } else {
        for (const collisionRect of collisions) {
          const key = rectToKey(collisionRect)

          if (seenRects.has(key)) {
            continue
          }
          seenRects.add(key)

          queue.push({
            minX: startRect.minX,
            maxX: startRect.maxX,
            minY: collisionRect.minY - totalHeight,
            maxY: collisionRect.minY,
          })
          queue.push({
            minX: startRect.minX,
            maxX: startRect.maxX,
            minY: collisionRect.maxY,
            maxY: collisionRect.maxY + totalHeight,
          })
          queue.push({
            minX: collisionRect.minX - width,
            maxX: collisionRect.minX,
            minY: startRect.minY,
            maxY: startRect.maxY,
          })
          queue.push({
            minX: collisionRect.maxX,
            maxX: collisionRect.maxX + width,
            minY: startRect.minY,
            maxY: startRect.maxY,
          })
        }
      }
    }

    if (!candidate) {
      console.log('could not position', candidate)
      throw new Error(`could not position ${d.id}`)
    }

    if (d.id.startsWith('Wiki-') && candidateDist > 1 && !d.properties.isTop) {
      continue
    }

    const spacing = spacingFactor * totalHeight

    tree.insert({
      minX: candidate.minX - 2 * spacing,
      maxX: candidate.maxX + 2 * spacing,
      minY: candidate.minY - spacing,
      maxY: candidate.maxY + spacing,
    })

    const labelProperties = {
      kind: 'label',
      name: d.properties.name,
      caption: d.properties.caption,
      color: d.properties.color,
      url: d.properties.url,
      pos: {
        x: candidate.minX,
        y: candidate.minY,
        w: width,
        h: height,
        cw: captionWidth,
        ch: captionHeight,
        th: totalHeight,
      }
    }

    objGeometries.push({
      id: d.id,
      ...d.geometry,
      properties: labelProperties,
    })
  }

  return resultTopoJSON
}
