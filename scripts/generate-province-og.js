const satori = require('satori').default;
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const OG_DIR = path.join(__dirname, '..', 'og-province');
const FLAG_PNG = fs.readFileSync(path.join(__dirname, '..', '..', 'zipcodes-ph', 'public', 'ph.png'));
const FLAG_BASE64 = `data:image/png;base64,${FLAG_PNG.toString('base64')}`;

const FONTS = [
  { name: 'Arial', data: fs.readFileSync('C:/Windows/Fonts/arial.ttf'), weight: 400, style: 'normal' },
  { name: 'Arial', data: fs.readFileSync('C:/Windows/Fonts/arialbd.ttf'), weight: 700, style: 'normal' },
];

function lngToTileX(lng, zoom) {
  return ((lng + 180) / 360) * Math.pow(2, zoom);
}
function latToTileY(lat, zoom) {
  const latRad = lat * Math.PI / 180;
  return (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * Math.pow(2, zoom);
}

async function fetchMapImage(centerLat, centerLng, citiesWithCoords, width, height, zoom) {
  const centerTileX = lngToTileX(centerLng, zoom);
  const centerTileY = latToTileY(centerLat, zoom);
  const centerPixelX = Math.floor(width / 2);
  const centerPixelY = Math.floor(height / 2);
  const tileSize = 256;
  const topLeftTileX = centerTileX - (centerPixelX / tileSize);
  const topLeftTileY = centerTileY - (centerPixelY / tileSize);
  const startTileX = Math.floor(topLeftTileX);
  const startTileY = Math.floor(topLeftTileY);
  const offsetX = Math.round((topLeftTileX - startTileX) * tileSize);
  const offsetY = Math.round((topLeftTileY - startTileY) * tileSize);
  const tilesX = Math.ceil((width + offsetX) / tileSize) + 1;
  const tilesY = Math.ceil((height + offsetY) / tileSize) + 1;

  const composites = [];
  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      const url = `https://tile.openstreetmap.org/${zoom}/${startTileX + tx}/${startTileY + ty}.png`;
      try {
        const res = await fetch(url, { headers: { 'User-Agent': 'zipcodes-ph-cdn/1.0' } });
        if (res.ok) {
          composites.push({
            input: Buffer.from(await res.arrayBuffer()),
            left: tx * tileSize - offsetX,
            top: ty * tileSize - offsetY,
          });
        }
      } catch (e) {}
    }
  }

  let mapImg = sharp({
    create: { width, height, channels: 3, background: { r: 220, g: 220, b: 220 } }
  }).png();
  mapImg = sharp(await mapImg.toBuffer()).composite(composites);

  // Add city markers
  const markers = [];
  for (const c of citiesWithCoords) {
    const px = Math.round((lngToTileX(c.longitude, zoom) - topLeftTileX) * tileSize) - 5;
    const py = Math.round((latToTileY(c.latitude, zoom) - topLeftTileY) * tileSize) - 5;
    if (px >= -5 && px < width + 5 && py >= -5 && py < height + 5) {
      const dot = Buffer.from(`<svg width="10" height="10"><circle cx="5" cy="5" r="4" fill="#2563eb" stroke="white" stroke-width="1.5"/></svg>`);
      markers.push({ input: dot, left: Math.max(0, Math.min(px, width - 10)), top: Math.max(0, Math.min(py, height - 10)) });
    }
  }

  return sharp(await mapImg.toBuffer()).composite(markers).png().toBuffer();
}

function calcZoom(cities) {
  if (cities.length < 2) return 11;
  const lats = cities.map(c => c.latitude);
  const lngs = cities.map(c => c.longitude);
  const latSpan = Math.max(...lats) - Math.min(...lats);
  const lngSpan = Math.max(...lngs) - Math.min(...lngs);
  const span = Math.max(latSpan, lngSpan);
  if (span > 3) return 7;
  if (span > 1.5) return 8;
  if (span > 0.8) return 9;
  if (span > 0.4) return 10;
  if (span > 0.2) return 11;
  return 12;
}

function buildMarkup({ provinceName, regionName, zipRange, totalCities, totalBarangays, topCities, restCities, mapBase64 }) {
  // Top 6 cities for right panel
  const topItems = topCities.map(c => ({
    type: 'div',
    props: {
      style: { display: 'flex', justifyContent: 'space-between', marginBottom: '6px' },
      children: [
        { type: 'div', props: { style: { display: 'flex', fontSize: '14px', color: '#ffffff' }, children: c.name } },
        { type: 'div', props: { style: { display: 'flex', fontSize: '14px', color: '#666666' }, children: c.zipCode } },
      ],
    },
  }));

  // Rest cities in 3 columns
  const restItems = restCities.map(c => ({
    type: 'div',
    props: {
      style: { display: 'flex', justifyContent: 'space-between', gap: '4px', marginBottom: '3px' },
      children: [
        { type: 'div', props: { style: { display: 'flex', fontSize: '11px', color: '#cccccc', flex: 1 }, children: c.name } },
        { type: 'div', props: { style: { display: 'flex', fontSize: '11px', color: '#555555' }, children: c.zipCode } },
      ],
    },
  }));

  // Split rest into 3 columns
  const colSize = Math.ceil(restItems.length / 3);
  const col1 = restItems.slice(0, colSize);
  const col2 = restItems.slice(colSize, colSize * 2);
  const col3 = restItems.slice(colSize * 2);

  const children = [
    // Row 1: Hero
    {
      type: 'div',
      props: {
        style: { display: 'flex', alignItems: 'center', padding: '20px 24px 14px' },
        children: [
          { type: 'img', props: { src: FLAG_BASE64, width: 24, height: 17, style: { marginRight: '12px', borderRadius: '2px' } } },
          {
            type: 'div',
            props: {
              style: { display: 'flex', flexDirection: 'column' },
              children: [
                { type: 'div', props: { style: { display: 'flex', fontSize: '28px', fontWeight: 800, color: '#ffffff', lineHeight: 1.2 }, children: provinceName } },
                { type: 'div', props: { style: { display: 'flex', fontSize: '14px', color: '#666666', marginTop: '4px' }, children: `${regionName} · ZIP ${zipRange} · ${totalCities} Cities · ${totalBarangays.toLocaleString()} Barangays` } },
              ],
            },
          },
        ],
      },
    },
    // Row 2: Map + Top cities
    {
      type: 'div',
      props: {
        style: { display: 'flex', padding: '0 16px', gap: '16px' },
        children: [
          { type: 'img', props: { src: mapBase64, width: 300, height: 260, style: { borderRadius: '8px', objectFit: 'cover' } } },
          {
            type: 'div',
            props: {
              style: { display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1 },
              children: [
                { type: 'div', props: { style: { display: 'flex', fontSize: '12px', color: '#00ff87', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '10px', fontWeight: 500 }, children: 'Top Cities' } },
                ...topItems,
              ],
            },
          },
        ],
      },
    },
  ];

  // Row 3: Rest cities (only if there are rest cities)
  if (restCities.length > 0) {
    children.push({
      type: 'div',
      props: {
        style: { display: 'flex', padding: '12px 16px 0', gap: '8px' },
        children: [
          { type: 'div', props: { style: { display: 'flex', flexDirection: 'column', flex: 1 }, children: col1 } },
          { type: 'div', props: { style: { display: 'flex', flexDirection: 'column', flex: 1 }, children: col2 } },
          { type: 'div', props: { style: { display: 'flex', flexDirection: 'column', flex: 1 }, children: col3 } },
        ],
      },
    });
  }

  // Bottom gradient
  children.push({
    type: 'div',
    props: { style: { height: '4px', background: 'linear-gradient(90deg, #00ff87, #60efff)', display: 'flex', marginTop: 'auto' } },
  });

  return {
    type: 'div',
    props: {
      style: { width: '100%', height: '100%', background: '#111111', display: 'flex', flexDirection: 'column' },
      children,
    },
  };
}

async function generateProvinceOg(data) {
  const { provinceName, regionName, zipRange, totalCities, totalBarangays, topCities, restCities, cities, slug } = data;

  const citiesWithCoords = cities.filter(c => c.latitude && c.longitude);
  const avgLat = citiesWithCoords.reduce((s, c) => s + c.latitude, 0) / citiesWithCoords.length;
  const avgLng = citiesWithCoords.reduce((s, c) => s + c.longitude, 0) / citiesWithCoords.length;
  const zoom = calcZoom(citiesWithCoords);

  const mapBuffer = await fetchMapImage(avgLat, avgLng, citiesWithCoords, 300, 260, zoom);
  const mapBase64 = `data:image/png;base64,${mapBuffer.toString('base64')}`;

  // Dynamic height: hero 80 + map row 280 + rest rows + gradient 4 + padding
  const restRows = Math.ceil(restCities.length / 3);
  const height = 80 + 270 + (restRows > 0 ? 20 + restRows * 16 : 0) + 16;

  const markup = buildMarkup({ provinceName, regionName, zipRange, totalCities, totalBarangays, topCities, restCities, mapBase64 });

  const svg = await satori(markup, { width: 630, height, fonts: FONTS });

  const outDir = path.join(OG_DIR);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outPath = path.join(outDir, `${slug}-zip-codes-map.jpg`);
  await sharp(Buffer.from(svg)).jpeg({ quality: 75 }).toFile(outPath);
  return outPath;
}

async function main() {
  const dataDir = path.join(__dirname, '..', '..', 'zipcodes-ph', 'contents', 'data');
  const allCities = JSON.parse(fs.readFileSync(path.join(dataDir, 'cities.json'), 'utf-8'));
  const provinces = JSON.parse(fs.readFileSync(path.join(dataDir, 'provinces.json'), 'utf-8'));
  const regions = JSON.parse(fs.readFileSync(path.join(dataDir, 'regions.json'), 'utf-8'));
  const barangaysDir = path.join(dataDir, 'barangays');

  const regionMap = {};
  regions.forEach(r => regionMap[r.slug] = r.name);

  // Count barangays per province
  const brgyCount = {};
  for (const file of fs.readdirSync(barangaysDir).filter(f => f.endsWith('.json'))) {
    const data = JSON.parse(fs.readFileSync(path.join(barangaysDir, file), 'utf-8'));
    data.forEach(b => { brgyCount[b.provinceSlug] = (brgyCount[b.provinceSlug] || 0) + 1; });
  }

  const total = provinces.length;
  let done = 0;
  let totalSize = 0;
  let errors = 0;

  console.log(`Generating ${total} province OG images...`);

  const BATCH = 3;
  for (let i = 0; i < provinces.length; i += BATCH) {
    const batch = provinces.slice(i, i + BATCH);
    const promises = batch.map(async (province) => {
      try {
        const cities = allCities.filter(c => c.provinceSlug === province.slug);
        if (cities.length === 0) return;

        const zips = cities.map(c => parseInt(c.zipCode)).filter(Boolean).sort((a, b) => a - b);
        const zipRange = zips.length > 0 ? `${zips[0]}-${zips[zips.length - 1]}` : '';

        // Sort cities by barangay count (descending) for top cities
        const citiesSorted = [...cities].sort((a, b) => (b.barangayCount || 0) - (a.barangayCount || 0));
        const topCities = citiesSorted.slice(0, 6);
        const restCities = citiesSorted.slice(6).sort((a, b) => a.name.localeCompare(b.name));

        const outPath = await generateProvinceOg({
          provinceName: province.name,
          regionName: regionMap[province.regionSlug] || '',
          zipRange,
          totalCities: cities.length,
          totalBarangays: brgyCount[province.slug] || 0,
          topCities,
          restCities,
          cities,
          slug: province.slug,
        });

        const stat = fs.statSync(outPath);
        totalSize += stat.size;
      } catch (e) {
        errors++;
        console.error(`\nError: ${province.slug}:`, e.message);
      }
      done++;
    });

    await Promise.all(promises);
    process.stdout.write(`\r  ${done}/${total} (${errors} errors)`);
    if (i + BATCH < provinces.length) await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\n\nDone! ${done} images, ${(totalSize / 1024 / 1024).toFixed(1)} MB total, ${errors} errors`);
}

main().catch(console.error);
