const path = require('path')
const fs = require('fs').promises
const geojson = require('geojson')

async function main() {
  const IMG_DIR_PATH = path.join(__dirname, '../imgs/')
  const DEST_DIR_PATH = path.join(__dirname, '../dist/imgs/')
  const imgs = await fs.readdir(IMG_DIR_PATH)

  try {
    await fs.mkdir(DEST_DIR_PATH)
  } catch (err) {
    if (err.code !== 'EEXIST') {
      throw err
    }
  }

  const data = []
  for (const imgName of imgs) {
    const imgBase = path.basename(imgName, '.png')
    const [name, latitudeStr, longitudeStr] = imgBase.split('-')
    const latitude = parseFloat(latitudeStr.replace(/_/g, '.'))
    const longitude = -parseFloat(longitudeStr.replace(/_/g, '.'))
    await fs.copyFile(
      path.join(IMG_DIR_PATH, imgName),
      path.join(DEST_DIR_PATH, `${name}.png`),
    )
    data.push({latitude, longitude, name})
  }
  const geodata = geojson.parse(data, {Point: ['latitude', 'longitude']})
  process.stdout.write(JSON.stringify(geodata))
}

main()
