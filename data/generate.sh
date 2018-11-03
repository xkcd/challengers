#!/bin/bash
set -e

states='01 02 04 05 06 08 09 10 12 13 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 32 33 34 35 36 37 38 39 40 41 42 44 45 46 47 48 49 50 51 53 54 55 56'
projection='d3.geoAlbersUsa().scale(1200).translate([490, 300])'

rm -rvf us
mkdir -p build json dist

echo 'downloading shapefiles'

if [ ! -f json/states.json ]; then
  for state in $states; do
    sldl="tl_2018_${state}_sldl"
    if [ ! -f build/$sldl.zip ]; then
      # state house shapes
      curl -o build/$sldl.zip "https://www2.census.gov/geo/tiger/TIGER2018/SLDL/$sldl.zip"
      unzip -od build build/$sldl.zip $sldl.shp $sldl.dbf
      chmod a-x build/${state}_sldl.*
    fi

    sldu="tl_2018_${state}_sldu"
    if [ ! -f build/$sldu.zip ]; then
      # state senate shapes
      curl -o build/$sldu.zip "https://www2.census.gov/geo/tiger/TIGER2018/SLDU/$sldu.zip"
      unzip -od build build/$sldu.zip $sldu.shp $sldu.dbf
      chmod a-x build/${state}_sldh.*
    fi
  done

  if [ ! -f build/tl_2018_us_cd116.zip ]; then
    # federal house shapes
    curl -o build/tl_2018_us_cd116.zip 'https://www2.census.gov/geo/tiger/TIGER2018/CD/tl_2018_us_cd116.zip'
    unzip -od build build/tl_2018_us_cd116.zip tl_2018_us_cd116.shp tl_2018_us_cd116.dbf
    chmod a-x build/tl_2018_us_cd116.*
  fi

  if [ ! -f build/cb_2017_us_county_5m.shp ]; then
    # county shapes
    curl -o build/cb_2017_us_county_5m.zip 'https://www2.census.gov/geo/tiger/GENZ2017/shp/cb_2017_us_county_5m.zip'
    unzip -od build build/cb_2017_us_county_5m.zip cb_2017_us_county_5m.shp cb_2017_us_county_5m.dbf
    chmod a-x build/cb_2017_us_county_5m.*
  fi

  echo 'processing state shapefiles'
  for state in $states; do
    sldl="tl_2018_${state}_sldl"
    sldu="tl_2018_${state}_sldu"
    echo "processing $state"
    mapshaper -i build/$sldl.shp -simplify 10% -o format=geojson json/${state}_sldl.json
    mapshaper -i build/$sldu.shp -simplify 10% -o format=geojson json/${state}_sldu.json
  done

  echo 'processing district data'
  mapshaper -i build/tl_2018_us_cd116.shp -simplify 10% -o format=geojson json/congress.json

  echo 'processing district data'
  mapshaper -i build/cb_2017_us_county_5m.shp -dissolve STATEFP -simplify 10% -o format=geojson json/states.json
fi

echo 'processing map data'
geo2topo -q 1e5 -n counties=<( \
    shp2json -n build/cb_2017_us_county_5m.shp \
      | ndjson-filter '!/000$/.test(d.properties.GEOID)' \
      | geoproject -n "$projection") \
  | toposimplify -f -p 1.5 \
  | topomerge states=counties -k 'd.properties.GEOID.slice(0, 2)' \
  | topomerge nation=states \
  > json/map.json

echo 'assembling state topojson'
# break apart and reassemble parts to remove county data
topo2geo < json/map.json states=json/map-states.json nation=json/map-nation.json
geo2topo states=json/map-states.json nation=json/map-nation.json \
  > dist/map-states-topo.json

echo 'processing label csvs'
node process-csv.js < candidates.csv > dist/candidates.json
node process-csv.js < trivia.csv > dist/trivia.json
node process-csv.js < cities.csv > dist/cities.json

echo 'matching articles with candidate data'
node district-facts.js

echo 'generating imgs data'
node process-imgs.js \
  | geoproject -n "$projection" \
  > dist/imgs.json

echo 'generating label geojson'
geojson-merge dist/candidates.json dist/trivia.json dist/cities.json dist/articles.json \
  | ndjson-cat \
  | geoproject -n "$projection" \
  > ./dist/labels.json
