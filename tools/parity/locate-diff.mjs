#!/usr/bin/env node
// ============================================================================
// Where is a parity diff, actually?
//
//   node tools/parity/locate-diff.mjs report/<slug>-<viewport>.diff.png
//
// A percentage says how much differs; it never says where, and on a 10,000px
// page the diff image is too tall to read. This prints the bounding box of the
// changed pixels and the densest rows, which is usually enough to name the
// element without opening anything.
//
// The number that cracked the brand conversion came from here: 6,900 differing
// pixels at EVERY viewport, with matching page heights. A count that does not
// move with the viewport cannot be text reflow — it was one fixed-size branch
// repeated per card, which turned out to be a price state.
// ============================================================================

import { PNG } from "pngjs";
import fs from "node:fs";
const f = process.argv[2];
const png = PNG.sync.read(fs.readFileSync(f));
let minX=1e9,minY=1e9,maxX=-1,maxY=-1,n=0;
const rows = new Map();
for (let y=0;y<png.height;y++) for (let x=0;x<png.width;x++){
  const i=(png.width*y+x)<<2;
  const r=png.data[i],g=png.data[i+1],b=png.data[i+2];
  if (r>180 && g<120 && b<120){ n++; if(x<minX)minX=x; if(x>maxX)maxX=x; if(y<minY)minY=y; if(y>maxY)maxY=y;
    rows.set(y,(rows.get(y)||0)+1); }
}
const top=[...rows.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8);
console.log(`red px ${n}  bbox x[${minX}-${maxX}] y[${minY}-${maxY}]  (page ${png.width}x${png.height})`);
console.log("densest rows:", top.map(([y,c])=>`y=${y}:${c}`).join("  "));
