async function test() {
  try {
    console.log('--- Testing AMO ---');
    const amoUrl = 'https://addons.mozilla.org/en-US/firefox/addon/ublock-origin/';
    const resChrome = await fetch(amoUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' } });
    const htmlChrome = await resChrome.text();
    console.log('AMO Chrome UA len:', htmlChrome.length);
    console.log('AMO Chrome has "Get Firefox":', htmlChrome.includes('Get Firefox'));

    const resFx = await fetch(amoUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0' } });
    const htmlFx = await resFx.text();
    console.log('AMO Firefox UA len:', htmlFx.length);
    console.log('AMO Firefox has "Get Firefox":', htmlFx.includes('Get Firefox'));
    console.log('AMO Firefox has "Add to Firefox":', htmlFx.includes('Add to Firefox'));
    const xpiMatches = htmlFx.match(/https:\/\/[^"']+\.xpi/g);
    console.log('AMO XPI matches in Fx HTML:', xpiMatches ? xpiMatches.slice(0, 3) : 'none');

    console.log('--- Testing Opera Addons ---');
    const operaUrl = 'https://addons.opera.com/en/extensions/details/ublock/';
    const resOperaNonOp = await fetch(operaUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' } });
    const htmlOperaNonOp = await resOperaNonOp.text();
    console.log('Opera Chrome UA len:', htmlOperaNonOp.length);
    console.log('Opera Chrome has download opera/get opera:', htmlOperaNonOp.includes('Download Opera') || htmlOperaNonOp.includes('download-opera') || htmlOperaNonOp.includes('operasoftware'));

    const resOperaOp = await fetch(operaUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 OPR/114.0.0.0' } });
    const htmlOperaOp = await resOperaOp.text();
    console.log('Opera OPR UA len:', htmlOperaOp.length);
    const dlIndex = htmlOperaOp.indexOf('/extensions/download/');
    if (dlIndex !== -1) {
      console.log('Opera button snippet (with OPR UA):', htmlOperaOp.substring(dlIndex - 150, dlIndex + 250));
    }
    const nonOpDlIndex = htmlOperaNonOp.indexOf('operasoftware.com') !== -1 ? htmlOperaNonOp.indexOf('operasoftware.com') : htmlOperaNonOp.indexOf('download');
    if (nonOpDlIndex !== -1) {
      console.log('Opera button snippet (with Chrome UA):', htmlOperaNonOp.substring(nonOpDlIndex - 150, nonOpDlIndex + 250));
    }

    console.log('--- Testing Chrome Web Store ---');
    const cwsUrl = 'https://chromewebstore.google.com/detail/ublock-origin/cjpalhdlnbpafiamejdnhcphjbkeiagm';
    const resCws = await fetch(cwsUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' } });
    const htmlCws = await resCws.text();
    console.log('CWS len:', htmlCws.length);
    const btnMatches = htmlCws.match(/<button[^>]*>.*?<\/button>/gi);
    console.log('CWS buttons count:', btnMatches ? btnMatches.length : 0);
    if (btnMatches) {
      btnMatches.slice(0, 5).forEach((b, idx) => console.log(`CWS Button ${idx}:`, b));
    }
    const googleDl = htmlCws.match(/https:\/\/(?:www\.)?google\.[a-z]+\/chrome/gi);
    console.log('CWS links to download chrome:', googleDl ? googleDl.slice(0, 3) : 'none');

  } catch (err) {
    console.error('Fetch error:', err);
  }
}
test();
