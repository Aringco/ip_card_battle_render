import sharp from 'sharp';
const sp = process.argv[2];
const { data, info } = await sharp(`${sp}/icons_sheet.png`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H, channels: C } = info;
const px = (x, y) => (y * W + x) * C;

// 배경 베이지는 균일하지 않아 고정 색이 아니라 **테두리에서 연결된 영역**으로 잡는다.
const BG = [233, 212, 180], TOL = 22;
const near = p => Math.max(Math.abs(data[p]-BG[0]), Math.abs(data[p+1]-BG[1]), Math.abs(data[p+2]-BG[2])) < TOL;
const bg = new Uint8Array(W * H), st = [];
const push = i => { if (!bg[i] && near(i * C)) { bg[i] = 1; st.push(i); } };
for (let x = 0; x < W; x++) { push(x); push((H-1)*W + x); }
for (let y = 0; y < H; y++) { push(y*W); push(y*W + W-1); }
while (st.length) { const i = st.pop(), x = i % W, y = (i/W)|0;
  if (x>0) push(i-1); if (x<W-1) push(i+1); if (y>0) push(i-W); if (y<H-1) push(i+W); }

// 배경이 아닌 픽셀의 연결 성분 → 큰 것만 아이콘
const seen = new Uint8Array(W*H), comps = [];
for (let s = 0; s < W*H; s++) {
  if (bg[s] || seen[s]) continue;
  let x0=W,y0=H,x1=0,y1=0,n=0; const q=[s]; seen[s]=1;
  while (q.length) { const i=q.pop(), x=i%W, y=(i/W)|0;
    if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; n++;
    for (const j of [i-1,i+1,i-W,i+W]) {
      if (j<0||j>=W*H) continue;
      if (Math.abs((j%W)-x) > 1) continue;
      if (!bg[j] && !seen[j]) { seen[j]=1; q.push(j); } } }
  comps.push({ x0, y0, x1, y1, n, w: x1-x0+1, h: y1-y0+1 });
}
comps.sort((a,b) => b.n - a.n);
console.log('큰 성분 12개 (아이콘은 8개여야 한다):');
for (const c of comps.slice(0, 12))
  console.log(`  ${String(c.w).padStart(4)}x${String(c.h).padStart(4)}  at (${String(c.x0).padStart(4)},${String(c.y0).padStart(4)})  픽셀 ${c.n}`);
