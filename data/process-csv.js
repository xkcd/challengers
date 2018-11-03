const neatCsv = require('neat-csv')
const geojson = require('geojson')
const getStdin = require('get-stdin')

async function main() {
  const csv = await getStdin()
  const data = await neatCsv(csv)
  const geodata = geojson.parse(data, {Point: ['latitude', 'longitude']})
  for (const feature of geodata.features) {
    feature.id = feature.properties.code
    delete feature.properties.code
    feature.properties.scale = parseFloat(feature.properties.scale)
  }
  process.stdout.write(JSON.stringify(geodata))
}

main()
