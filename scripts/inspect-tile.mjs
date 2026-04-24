// Inspect layer names + feature counts in a 国土地理院 optimal_bvmap-v1 tile.
// Usage: node scripts/inspect-tile.mjs [z x y]
import { VectorTile } from "@mapbox/vector-tile";
import Pbf from "pbf";

const [, , zArg, xArg, yArg] = process.argv;
const z = Number(zArg ?? 13);
const x = Number(xArg ?? 7276);
const y = Number(yArg ?? 3225);

const url = `https://cyberjapandata.gsi.go.jp/xyz/optimal_bvmap-v1/${z}/${x}/${y}.pbf`;
const res = await fetch(url);
if (!res.ok) {
  console.error(`fetch failed: ${res.status}`);
  process.exit(1);
}
const buf = await res.arrayBuffer();
const tile = new VectorTile(new Pbf(buf));
const out = {};
for (const name of Object.keys(tile.layers)) {
  const layer = tile.layers[name];
  const geomTypes = new Set();
  const sampleProps = [];
  for (let i = 0; i < Math.min(layer.length, 3); i++) {
    const f = layer.feature(i);
    geomTypes.add(["Unknown", "Point", "LineString", "Polygon"][f.type] ?? String(f.type));
    sampleProps.push(f.properties);
  }
  out[name] = {
    features: layer.length,
    types: [...geomTypes],
    sampleProps,
  };
}
console.log(JSON.stringify({ url, bytes: buf.byteLength, layers: out }, null, 2));
