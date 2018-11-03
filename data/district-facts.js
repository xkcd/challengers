const path = require('path')
const createReadStream = require('fs').createReadStream
const fs = require('fs').promises
const csv = require('csv-parser')
const whichPolygon = require('which-polygon')
const geojsonArea = require('@mapbox/geojson-area')
const geojson = require('geojson')

const states = '01 02 04 05 06 08 09 10 12 13 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 32 33 34 35 36 37 38 39 40 41 42 44 45 46 47 48 49 50 51 53 54 55 56'.split(' ')

const shapeKey = ({kind, fips, namelsad}) => `${kind}-${fips}-${namelsad}`

const articleBlacklist = /shooting|murder|killing|lynch|^united_states$|^north_america$|(^(,_)?alabama$|alaska$|arizona$|arkansas$|california$|colorado$|connecticut$|delaware$|florida$|georgia$|hawaii$|idaho$|illinois$|indiana$|iowa$|kansas$|kentucky$|louisiana$|maine$|maryland$|massachusetts$|michigan$|minnesota$|mississippi$|missouri$|montana$|nebraska$|nevada$|new_hampshire$|new_jersey$|new_mexico$|new_york$|north_carolina$|north_dakota$|ohio$|oklahoma$|oregon$|pennsylvania$|rhode_island$|south_carolina$|south_dakota$|tennessee$|texas$|utah$|vermont$|virginia$|washington$|west_virginia$|wisconsin$|wyoming)$/i

async function main() {
  const features = []

  async function loadFeatures(fname, kind) {
    const fpath = path.join(__dirname, fname)
    const data = await fs.readFile(fpath, 'utf8')
    const parsed = JSON.parse(data)
    for (const feature of parsed.features) {
      const {NAMELSAD, STATEFP} = feature.properties
      feature.properties = {
        key: shapeKey({
          fips: STATEFP,
          namelsad: NAMELSAD || 'Statewide',
          kind,
        }),
        area: geojsonArea.geometry(feature.geometry),
      }
      features.push(feature)
    }
    console.log('loaded', fname)
  }


  await loadFeatures('json/states.json', 'State')
  await loadFeatures('json/congress.json', 'Congress')
  for (const state of states) {
    await loadFeatures(`json/${state}_sldl.json`, 'StateHouse')
    await loadFeatures(`json/${state}_sldu.json`, 'StateSenate')
  }

  const findShape = whichPolygon({type:'FeatureCollection', features})

  const ARTICLES_JSON_PATH = path.join(__dirname, 'dist/articles.json')
  const CANDIDATES_JSON_PATH = path.join(__dirname, 'dist/candidates.json')
  const WIKI_CSV_PATH = path.join(__dirname, 'wiki-lengths.csv')

  const candidatesData = await fs.readFile(CANDIDATES_JSON_PATH, 'utf8')
  const candidates = JSON.parse(candidatesData)

  const shapeIndex = new Map()

  await new Promise(resolve => {
    createReadStream(WIKI_CSV_PATH, 'utf8')
      .pipe(csv())
      .on('data', article => {
        if (articleBlacklist.test(article.slug)) {
          return
        }

        article.longitude = parseFloat(article.longitude)
        article.latitude = parseFloat(article.latitude)
        article.length = parseInt(article.length)

        const matches = findShape([
          article.longitude,
          article.latitude,
        ], true)

        if (!matches) {
          return
        }

        matches.sort((a, b) => b.area - a.area)

        for (const match of matches) {
          const {key} = match

          let curArticles = shapeIndex.get(key)
          if (!curArticles) {
            curArticles = Array(4)
            shapeIndex.set(key, curArticles)
          }

          for (let i = 0; i < curArticles.length; i++) {
            const curArticle = curArticles[i]
            if (!curArticle || curArticle.length < article.length) {
              curArticles[i] = article
              return
            }
          }
        }
      })
      .on('end', resolve)
  })


  const data = []
  for (const key of shapeIndex.keys()) {
    const articles = shapeIndex.get(key)
    for (let i = 0; i < articles.length; i++) {
      const article = articles[i]
      if (!article) {
        continue
      }

      const articleTitle = decodeURIComponent(article.slug.replace(/_/g, ' '))
      data.push({
        code: `Wiki-${key.split('-')[0]}`,
        longitude: article.longitude,
        latitude: article.latitude,
        name: articleTitle,
        url: `https://en.wikipedia.org/wiki/${article.slug}`,
        color: 'gray',
        scale: 0.01,
        length: article.length,
        isTop: i === 0,
      })
    }
  }

  const geodata = geojson.parse(data, {Point: ['latitude', 'longitude']})
  for (const feature of geodata.features) {
    feature.id = feature.properties.code
    delete feature.properties.code
  }

  await fs.writeFile(ARTICLES_JSON_PATH, JSON.stringify(geodata))
}

main()
