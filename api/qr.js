export default async function handler(req, res) {
  // Extract the text from query, or from the path if we use rewrites
  const text = req.query.text;
  if (!text) {
    return res.status(400).send('Missing text parameter');
  }

  const quickchartUrl = `https://quickchart.io/qr?format=png&size=400&text=${encodeURIComponent(text)}`;

  try {
    const fetchResponse = await fetch(quickchartUrl);
    if (!fetchResponse.ok) {
      return res.status(500).send('Failed to fetch QR');
    }

    const buffer = await fetchResponse.arrayBuffer();

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error('QR Proxy Error:', error);
    res.status(500).send('Error generating QR');
  }
}