const path = require('path')
const webpack = require('webpack')

module.exports = {
  entry: {
    dev: './src/dev.js',
    comic: './src/index.js'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js'
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env'],
            plugins: [
              '@babel/plugin-proposal-class-properties',
              '@babel/plugin-transform-runtime'
            ]
          }
        }
      }
    ]
  },
  plugins: [
    new webpack.BannerPlugin('map layout and renderer by chromako.de\nshape data crunching by @seakelps\nthanks to @mbostock for d3, topojson, and us-atlas.'),
  ],
  devServer: {
    contentBase: path.resolve(__dirname, 'dist'),
  }
}
