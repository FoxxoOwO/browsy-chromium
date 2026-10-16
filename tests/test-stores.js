async function testStores() {
  console.log('--- 1. Testing Chrome Web Store Download ---');
  const chromeId = 'eimadpbcbfnmbkopoojfekhnkhdbieeh'; // Dark Reader
  const chromeUrl = `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=130.0&acceptformat=crx2,crx3&x=id%3D${chromeId}%26uc`;
  const cRes = await fetch(chromeUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } });
  console.log('Chrome Store Status:', cRes.status, 'Type:', cRes.headers.get('content-type'));

  console.log('--- 2. Testing Opera Store Download ---');
  const operaPageUrl = 'https://addons.opera.com/en/extensions/details/install-chrome-extensions/';
  const oRes = await fetch(operaPageUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 OPR/114.0.0.0' } });
  console.log('Opera Page Status:', oRes.status);
  const oHtml = await oRes.text();
  const oMatch = oHtml.match(/\/extensions\/download\/[a-zA-Z0-9_-]+\//);
  console.log('Opera Download Path:', oMatch ? oMatch[0] : 'None');
  if (oMatch) {
    const oDlRes = await fetch('https://addons.opera.com' + oMatch[0], {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 OPR/114.0.0.0' }
    });
    console.log('Opera DL Status:', oDlRes.status, 'Type:', oDlRes.headers.get('content-type'));
    const buf = Buffer.from(await oDlRes.arrayBuffer());
    console.log('Opera DL bytes:', buf.length);
    const pkIndex = buf.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    console.log('Opera PK Index:', pkIndex);
  }

  console.log('--- 3. Testing Firefox Add-ons (AMO) API ---');
  const amoSlug = 'tree-style-tab';
  const amoApiUrl = `https://addons.mozilla.org/api/v5/addons/addon/${amoSlug}/`;
  const fRes = await fetch(amoApiUrl);
  console.log('AMO API Status:', fRes.status);
  if (fRes.ok) {
    const data = await fRes.json();
    console.log('AMO Addon Name:', data.name?.cs || data.name?.['en-US'] || data.name);
    console.log('AMO XPI Download URL:', data.current_version?.file?.url);
    if (data.current_version?.file?.url) {
      const xpiRes = await fetch(data.current_version.file.url);
      console.log('XPI Download Status:', xpiRes.status, 'Size:', xpiRes.headers.get('content-length'));
      const xpiBuf = Buffer.from(await xpiRes.arrayBuffer());
      const pkIndex = xpiBuf.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
      console.log('AMO XPI PK Index:', pkIndex);
    }
  }
}

testStores().catch(console.error);
