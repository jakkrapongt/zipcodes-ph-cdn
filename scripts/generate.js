const satori = require('satori').default;
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const OG_DIR = path.join(__dirname, '..', 'og');
const DATA_DIR = path.join(__dirname, '..', '..', 'zipcodes-ph', 'contents', 'data');
const FLAG_PNG = fs.readFileSync(path.join(__dirname, '..', '..', 'zipcodes-ph', 'public', 'ph.png'));
const FLAG_BASE64 = `data:image/png;base64,${FLAG_PNG.toString('base64')}`;

// Load fonts once
const FONTS = [
  { name: 'Arial', data: fs.readFileSync('C:/Windows/Fonts/arial.ttf'), weight: 400, style: 'normal' },
  { name: 'Arial', data: fs.readFileSync('C:/Windows/Fonts/arialbd.ttf'), weight: 700, style: 'normal' },
];

const COLORS = {
  bg: '#111111',
  accent: '#00ff87',
  zipCode: '#ffffff',
  brgy: '#ffffff',
  cityProvince: '#666666',
};

function buildMarkup({ zip, brgy, city, province }) {
  return {
    type: 'div',
    props: {
      style: {
        width: '100%',
        height: '100%',
        background: COLORS.bg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
      },
      children: [
        // Bottom gradient line
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: '6px',
              background: 'linear-gradient(90deg, #00ff87, #60efff)',
              display: 'flex',
            },
          },
        },
        // Zip Code label with flag
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              alignItems: 'center',
              marginBottom: '12px',
            },
            children: [
              {
                type: 'img',
                props: {
                  src: FLAG_BASE64,
                  width: 24,
                  height: 17,
                  style: { marginRight: '10px', borderRadius: '2px' },
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    fontSize: '20px',
                    color: COLORS.accent,
                    letterSpacing: '0.25em',
                    textTransform: 'uppercase',
                    fontWeight: 500,
                  },
                  children: 'Zip Code',
                },
              },
            ],
          },
        },
        // Zip Code number
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              fontSize: '160px',
              fontWeight: 800,
              color: COLORS.zipCode,
              lineHeight: 1,
              letterSpacing: '-0.02em',
              marginBottom: '32px',
            },
            children: zip,
          },
        },
        // Barangay/City name
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              fontSize: '48px',
              fontWeight: 700,
              color: COLORS.brgy,
              marginBottom: '12px',
              textAlign: 'center',
              maxWidth: '90%',
            },
            children: brgy,
          },
        },
        // City, Province
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              fontSize: '28px',
              color: COLORS.cityProvince,
            },
            children: `${city}, ${province}`,
          },
        },
      ],
    },
  };
}

async function generateImage({ zip, brgy, city, province, slug, provinceSlug, citySlug }) {
  const markup = buildMarkup({ zip, brgy, city, province });

  const svg = await satori(markup, {
    width: 630,
    height: 630,
    fonts: FONTS,
  });

  const outDir = citySlug
    ? path.join(OG_DIR, provinceSlug, citySlug)
    : path.join(OG_DIR, provinceSlug);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const outPath = path.join(outDir, `${slug}.jpg`);
  await sharp(Buffer.from(svg))
    .jpeg({ quality: 70 })
    .toFile(outPath);

  return outPath;
}

// Load data from zipcodes-ph
function loadJSON(filename) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, filename), 'utf-8'));
}

function loadAllBarangays() {
  const dir = path.join(DATA_DIR, 'barangays');
  const barangays = [];
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
    barangays.push(...JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8')));
  }
  return barangays;
}

async function main() {
  const cities = loadJSON('cities.json');
  const provinces = loadJSON('provinces.json');
  const barangays = loadAllBarangays();

  const provinceMap = {};
  for (const p of provinces) {
    provinceMap[p.slug] = p.name;
  }

  // Group barangays by city
  const brgyByCity = {};
  for (const b of barangays) {
    if (!brgyByCity[b.citySlug]) brgyByCity[b.citySlug] = [];
    brgyByCity[b.citySlug].push(b);
  }

  const BATCH_SIZE = 50;
  let totalCount = 0;
  let totalSize = 0;

  // Generate city images
  console.log(`Generating ${cities.length} city images...`);
  for (let i = 0; i < cities.length; i += BATCH_SIZE) {
    const batch = cities.slice(i, i + BATCH_SIZE);
    const promises = batch.map(city => {
      const provinceName = provinceMap[city.provinceSlug] || city.provinceSlug;
      const cityBarangays = brgyByCity[city.slug] || [];
      const zipCode = city.zipCode || (cityBarangays.length > 0 ? cityBarangays[0].zipCode : '');
      if (!zipCode) return null;

      return generateImage({
        zip: zipCode,
        brgy: city.name,
        city: provinceName,
        province: 'Philippines',
        slug: `${zipCode}-${city.slug}`,
        provinceSlug: city.provinceSlug,
      });
    });

    const results = await Promise.all(promises.filter(Boolean));
    for (const outPath of results) {
      const stat = fs.statSync(outPath);
      totalSize += stat.size;
      totalCount++;
    }
    process.stdout.write(`\r  Cities: ${Math.min(i + BATCH_SIZE, cities.length)}/${cities.length}`);
  }
  console.log();

  // Generate barangay images
  console.log(`Generating ${barangays.length} barangay images...`);
  for (let i = 0; i < barangays.length; i += BATCH_SIZE) {
    const batch = barangays.slice(i, i + BATCH_SIZE);
    const promises = batch.map(b => {
      const provinceName = provinceMap[b.provinceSlug] || b.provinceSlug;
      // Find city name
      const city = cities.find(c => c.slug === b.citySlug);
      const cityName = city ? city.name : b.citySlug;

      return generateImage({
        zip: b.zipCode,
        brgy: b.fullName || b.name,
        city: cityName,
        province: provinceName,
        slug: `${b.zipCode}-${b.slug}`,
        provinceSlug: b.provinceSlug,
        citySlug: b.citySlug,
      });
    });

    const results = await Promise.all(promises);
    for (const outPath of results) {
      const stat = fs.statSync(outPath);
      totalSize += stat.size;
      totalCount++;
    }
    process.stdout.write(`\r  Barangays: ${Math.min(i + BATCH_SIZE, barangays.length)}/${barangays.length}`);
  }
  console.log();

  console.log(`\nDone! ${totalCount} images, ${(totalSize / 1024 / 1024).toFixed(1)} MB total`);
}

main().catch(console.error);
