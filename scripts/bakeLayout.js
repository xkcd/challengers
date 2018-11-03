#!/usr/bin/env node
const { Console } = require('console')
const webpack = require('webpack')
const WebpackDevServer = require('webpack-dev-server')
const webpackConfig = require('../webpack.config.js')
const puppeteer = require('puppeteer')

// Send all logging output to stderr
global.console = new Console(process.stderr, process.stderr)

async function main() {
  // only build dev entry
  delete webpackConfig.entry.comic

  const compiler = webpack({...webpackConfig, mode: 'production'})
  const wds = new WebpackDevServer(compiler, webpackConfig.devServer)
  wds.listen(3000, 'localhost')

  console.log('Starting Puppeteer...')
  const browser = await puppeteer.launch()
  const page = await browser.newPage()
  page.on('console', msg => console.log('[page]', msg.text()))
  await page.goto('http://localhost:3000/index.html', {waitUntil: 'load'})
  console.log('Page loaded.')
  const layoutTopoJSON = await page.evaluate('window.layoutTopoJSON')
  await browser.close()

  const jsonData = JSON.stringify(layoutTopoJSON, (k, v) =>
    v.toFixed ? Number(v.toFixed(3)) : v
  )
  process.stdout.write(jsonData)
  process.exit(0)
}

main()
