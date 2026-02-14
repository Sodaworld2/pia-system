const fs = require('fs');
const p = 'C:\\Users\\User\\Documents\\GitHub\\DAOV1\\backend\\src\\routes\\signatures.ts';
let c = fs.readFileSync(p, 'utf8');
if (c.includes("router.get('/', async")) {
  console.log('already patched');
  process.exit(0);
}
const marker = "router.post('/sign'";
const idx = c.indexOf(marker);
if (idx < 0) { console.log('marker not found'); process.exit(1); }
const handler = `// GET /api/signatures - List all signatures
router.get('/', async (req, res) => {
  try {
    const { agreement_id } = req.query;
    let query = db('agreement_signatures').select('*');
    if (agreement_id) {
      query = query.where('agreement_id', agreement_id);
    }
    const signatures = await query.orderBy('signed_at', 'desc').limit(50);
    res.json({ success: true, data: signatures, count: signatures.length });
  } catch (error) {
    console.error('Error fetching signatures:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch signatures' });
  }
});

`;
c = c.slice(0, idx) + handler + c.slice(idx);
fs.writeFileSync(p, c);
console.log('PATCHED signatures.ts');
