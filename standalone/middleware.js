export const config = {
  matcher: '/',
};

export default async function middleware(req) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');

  if (!id) {
    return;
  }

  try {
    // Check firebase for the short link data
    const fbRes = await fetch(`https://socail-media-creation-default-rtdb.firebaseio.com/sm_short_links/${id}.json`);
    const data = await fbRes.json();
    
    // If it's a string, it might have the new format: boardId|m|y|shareType|tStr|dStr
    let title = null;
    let date = null;
    let shareType = null;
    if (typeof data === 'string') {
      const parts = data.split('|');
      if (parts.length >= 6) {
        shareType = parts[3];
        title = decodeURIComponent(parts[4]);
        date = decodeURIComponent(parts[5]);
      }
    }

    if (!title) {
      return; // Fallback to normal behavior for old links
    }

    const fetchUrl = new URL('/index.html', req.url);
    fetchUrl.searchParams.set('bypass', '1');
    
    const response = await fetch(fetchUrl, { cache: 'no-store' });
    let html = await response.text();

    const prefix = shareType === 'publishing_plan' ? 'خطة النشر' : 'خطة المحتوى';
    const newTitle = `${prefix} للسوشيال ميديا - ${title}`;
    const newDesc = date ? date : `اضغط هنا لعرض ${prefix} الخاصة بك.`;

    html = html.replace(
      '<title>خطة المحتوى للسوشيال ميديا</title>', 
      `<title>${newTitle}</title>`
    );
    
    const ogTags = `
    <meta property="og:title" content="${newTitle}">
    <meta property="og:description" content="${newDesc}">
    <meta property="og:type" content="website">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${newTitle}">
    <meta name="twitter:description" content="${newDesc}">
    </head>`;
    
    html = html.replace('</head>', ogTags);

    return new Response(html, {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'public, max-age=0, must-revalidate',
      },
    });
  } catch (err) {
    console.error('Middleware error:', err);
    return;
  }
}
