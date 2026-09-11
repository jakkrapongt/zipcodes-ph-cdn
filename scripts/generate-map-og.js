const satori = require('satori').default;
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const OG_DIR = path.join(__dirname, '..', 'og-map');
const FLAG_PNG = fs.readFileSync(path.join(__dirname, '..', '..', 'zipcodes-ph', 'public', 'ph.png'));
const FLAG_BASE64 = `data:image/png;base64,${FLAG_PNG.toString('base64')}`;

const FONTS = [
  { name: 'Arial', data: fs.readFileSync('C:/Windows/Fonts/arial.ttf'), weight: 400, style: 'normal' },
  { name: 'Arial', data: fs.readFileSync('C:/Windows/Fonts/arialbd.ttf'), weight: 700, style: 'normal' },
];

// Courier marker colors
const MARKER_COLORS = ['#ef4444', '#22c55e', '#f59e0b', '#3b82f6', '#a855f7', '#ec4899', '#06b6d4'];

// Convert lat/lng to tile x,y at given zoom
function lngToTileX(lng, zoom) {
  return ((lng + 180) / 360) * Math.pow(2, zoom);
}
function latToTileY(lat, zoom) {
  const latRad = lat * Math.PI / 180;
  return (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * Math.pow(2, zoom);
}

// Fetch map tiles and stitch into a single image
async function fetchMapImage(lat, lng, branches, width, height, zoom) {
  const centerTileX = lngToTileX(lng, zoom);
  const centerTileY = latToTileY(lat, zoom);

  // Calculate pixel offset of center within tile
  const centerPixelX = Math.floor(width / 2);
  const centerPixelY = Math.floor(height / 2);

  // Top-left tile and pixel offset
  const tileSize = 256;
  const topLeftTileX = centerTileX - (centerPixelX / tileSize);
  const topLeftTileY = centerTileY - (centerPixelY / tileSize);

  const startTileX = Math.floor(topLeftTileX);
  const startTileY = Math.floor(topLeftTileY);
  const offsetX = Math.round((topLeftTileX - startTileX) * tileSize);
  const offsetY = Math.round((topLeftTileY - startTileY) * tileSize);

  const tilesX = Math.ceil((width + offsetX) / tileSize) + 1;
  const tilesY = Math.ceil((height + offsetY) / tileSize) + 1;

  // Fetch tiles
  const composites = [];
  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      const tileXNum = startTileX + tx;
      const tileYNum = startTileY + ty;
      const url = `https://tile.openstreetmap.org/${zoom}/${tileXNum}/${tileYNum}.png`;

      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'zipcodes-ph-cdn/1.0 (og image generator)' }
        });
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          composites.push({
            input: buf,
            left: tx * tileSize - offsetX,
            top: ty * tileSize - offsetY,
          });
        }
      } catch (e) {
        // skip failed tiles
      }
    }
  }

  // Create base image and composite tiles
  let mapImg = sharp({
    create: { width, height, channels: 3, background: { r: 220, g: 220, b: 220 } }
  }).png();

  mapImg = sharp(await mapImg.toBuffer()).composite(composites);

  // Add markers
  const markers = [];

  // Main location marker (blue dot with white border)
  const mainMarker = Buffer.from(`<svg width="20" height="20"><circle cx="10" cy="10" r="8" fill="#2563eb" stroke="white" stroke-width="3"/></svg>`);
  markers.push({
    input: mainMarker,
    left: centerPixelX - 10,
    top: centerPixelY - 10,
  });

  // Courier markers
  branches.forEach((b, i) => {
    const bTileX = lngToTileX(b.lng, zoom);
    const bTileY = latToTileY(b.lat, zoom);
    const px = Math.round((bTileX - topLeftTileX) * tileSize) - 7;
    const py = Math.round((bTileY - topLeftTileY) * tileSize) - 7;
    const color = MARKER_COLORS[i % MARKER_COLORS.length];

    if (px >= -10 && px < width + 10 && py >= -10 && py < height + 10) {
      const markerSvg = Buffer.from(`<svg width="14" height="14"><circle cx="7" cy="7" r="6" fill="${color}" stroke="white" stroke-width="2"/></svg>`);
      markers.push({ input: markerSvg, left: Math.max(0, Math.min(px, width - 14)), top: Math.max(0, Math.min(py, height - 14)) });
    }
  });

  return sharp(await mapImg.toBuffer()).composite(markers).png().toBuffer();
}

function buildMarkup({ zip, cityName, provinceName, branches, mapBase64 }) {
  const courierItems = branches.slice(0, 5).map((b, i) => {
    const color = MARKER_COLORS[i % MARKER_COLORS.length];
    const addr = (b.address || '').substring(0, 40);
    return {
      type: 'div',
      props: {
        style: { display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '10px' },
        children: [
          // Color dot
          {
            type: 'div',
            props: {
              style: { width: '10px', height: '10px', borderRadius: '5px', background: color, flexShrink: 0, marginTop: '4px', display: 'flex' },
            },
          },
          // Info
          {
            type: 'div',
            props: {
              style: { display: 'flex', flexDirection: 'column' },
              children: [
                {
                  type: 'div',
                  props: {
                    style: { display: 'flex', fontSize: '14px', color: '#00ff87', fontWeight: 600 },
                    children: b.courierName,
                  },
                },
                {
                  type: 'div',
                  props: {
                    style: { display: 'flex', fontSize: '14px', color: '#ffffff' },
                    children: b.name,
                  },
                },
                addr ? {
                  type: 'div',
                  props: {
                    style: { display: 'flex', fontSize: '11px', color: '#666666' },
                    children: addr,
                  },
                } : null,
              ].filter(Boolean),
            },
          },
        ],
      },
    };
  });

  return {
    type: 'div',
    props: {
      style: {
        width: '100%', height: '100%', background: '#111111',
        display: 'flex', flexDirection: 'column',
      },
      children: [
        // Hero section - 2 columns
        {
          type: 'div',
          props: {
            style: {
              display: 'flex', alignItems: 'center',
              padding: '20px 24px 16px',
            },
            children: [
              // Left: ZIP code big
              {
                type: 'div',
                props: {
                  style: { display: 'flex', fontSize: '80px', fontWeight: 800, color: '#ffffff', lineHeight: 1, marginRight: '20px' },
                  children: zip,
                },
              },
              // Right: flag + label + location
              {
                type: 'div',
                props: {
                  style: { display: 'flex', flexDirection: 'column' },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: { display: 'flex', alignItems: 'center', marginBottom: '6px' },
                        children: [
                          {
                            type: 'img',
                            props: { src: FLAG_BASE64, width: 20, height: 14, style: { marginRight: '8px', borderRadius: '2px' } },
                          },
                          {
                            type: 'div',
                            props: {
                              style: { display: 'flex', fontSize: '16px', color: '#00ff87', letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 500 },
                              children: 'ZIP Code',
                            },
                          },
                        ],
                      },
                    },
                    {
                      type: 'div',
                      props: {
                        style: { display: 'flex', fontSize: '20px', color: '#888888' },
                        children: `${cityName}, ${provinceName}`,
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
        // Bottom section: map + courier list
        {
          type: 'div',
          props: {
            style: { display: 'flex', flex: 1, padding: '0 16px 16px', gap: '16px' },
            children: [
              // Map
              {
                type: 'img',
                props: {
                  src: mapBase64,
                  width: 340,
                  height: 340,
                  style: { borderRadius: '8px', objectFit: 'cover' },
                },
              },
              // Courier list
              {
                type: 'div',
                props: {
                  style: { display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1 },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: { display: 'flex', fontSize: '14px', color: '#00ff87', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '12px', fontWeight: 500 },
                        children: 'Nearby Couriers',
                      },
                    },
                    ...courierItems,
                  ],
                },
              },
            ],
          },
        },
        // Bottom gradient line
        {
          type: 'div',
          props: {
            style: {
              height: '4px',
              background: 'linear-gradient(90deg, #00ff87, #60efff)',
              display: 'flex',
            },
          },
        },
      ],
    },
  };
}

async function generateMapOg({ zip, cityName, provinceName, lat, lng, branches, slug, provinceSlug }) {
  // Fetch map image
  const mapWidth = 340;
  const mapHeight = 340;
  const zoom = 12;
  const mapBuffer = await fetchMapImage(lat, lng, branches, mapWidth, mapHeight, zoom);
  const mapBase64 = `data:image/png;base64,${mapBuffer.toString('base64')}`;

  const markup = buildMarkup({ zip, cityName, provinceName, branches, mapBase64 });

  const svg = await satori(markup, { width: 630, height: 500, fonts: FONTS });

  const outDir = path.join(OG_DIR, provinceSlug);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outPath = path.join(outDir, `${slug}-zip-code-map-couriers.jpg`);
  await sharp(Buffer.from(svg)).jpeg({ quality: 75 }).toFile(outPath);

  return outPath;
}

async function main() {
  const dataDir = path.join(__dirname, '..', '..', 'zipcodes-ph', 'contents', 'data');
  const zipCodes = JSON.parse(fs.readFileSync(path.join(dataDir, 'zip-codes.json'), 'utf-8'));
  const cities = JSON.parse(fs.readFileSync(path.join(dataDir, 'cities.json'), 'utf-8'));
  const provinces = JSON.parse(fs.readFileSync(path.join(dataDir, 'provinces.json'), 'utf-8'));
  const branches = JSON.parse(fs.readFileSync(path.join(dataDir, 'courier-branches.json'), 'utf-8'));

  const cityMap = {};
  cities.forEach(c => cityMap[c.slug] = c);

  const provinceMap = {};
  provinces.forEach(p => provinceMap[p.slug] = p.name);

  function dist(lat1, lon1, lat2, lon2) {
    const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function findNearby(lat, lng, limit = 5) {
    return branches
      .map(b => ({ ...b, distance: dist(lat, lng, b.lat, b.lng) }))
      .filter(b => b.distance <= 15)
      .sort((a, b) => a.distance - b.distance)
      .reduce((acc, b) => {
        const count = acc.filter(x => x.courier === b.courier).length;
        if (count < 2 && acc.length < limit) acc.push(b);
        return acc;
      }, []);
  }

  const entries = Object.entries(zipCodes);
  const total = entries.length;
  let done = 0;
  let totalSize = 0;
  let errors = 0;

  console.log(`Generating ${total} map OG images...`);

  // Process in batches of 5 (rate limit for tile server)
  const BATCH = 5;
  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = entries.slice(i, i + BATCH);
    const promises = batch.map(async ([zipCode, data]) => {
      const city = cityMap[data.city];
      if (!city || !city.latitude || !city.longitude) return;

      const provinceName = provinceMap[city.provinceSlug] || city.provinceSlug;
      const nearby = findNearby(city.latitude, city.longitude);

      try {
        const outPath = await generateMapOg({
          zip: zipCode,
          cityName: city.name,
          provinceName,
          lat: city.latitude,
          lng: city.longitude,
          branches: nearby,
          slug: `${zipCode}-${city.slug}`,
          provinceSlug: city.provinceSlug,
        });
        const stat = fs.statSync(outPath);
        totalSize += stat.size;
      } catch (e) {
        errors++;
      }
      done++;
    });

    await Promise.all(promises);
    process.stdout.write(`\r  ${done}/${total} (${errors} errors)`);

    // Small delay to be nice to tile server
    if (i + BATCH < entries.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  console.log(`\n\nDone! ${done} images, ${(totalSize / 1024 / 1024).toFixed(1)} MB total, ${errors} errors`);
}

main().catch(console.error);
