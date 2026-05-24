export const config = {
  matcher: '/',
};

export default async function middleware(req) {
  const url = new URL(req.url);
  const title = url.searchParams.get('t');
  const date = url.searchParams.get('d');

  if (!title) {
    return;
  }

  try {
    // Fetch the original index.html from the same host
    const fetchUrl = new URL('/index.html', req.url);
    // Add a dummy parameter to avoid infinite loops if index.html is also matched
    fetchUrl.searchParams.set('bypass', '1');
    
    const response = await fetch(fetchUrl);
    let html = await response.text();

    const newTitle = `خطة المحتوى للسوشيال ميديا - ${title}`;
    const newDesc = date ? date : 'اضغط هنا لعرض خطة المحتوى الخاصة بك.';

    // Replace the title
    html = html.replace(
      '<title>خطة المحتوى للسوشيال ميديا</title>', 
      `<title>${newTitle}</title>`
    );
    
    // Inject OG tags right before </head>
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
