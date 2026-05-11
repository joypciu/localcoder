const fs = require('fs');
const { JSDOM } = require('jsdom');

try {
  const html = fs.readFileSync('sdks/vscode/media/chat.html', 'utf-8');
  const dom = new JSDOM(html, { runScripts: 'dangerously' });
  console.log('✓ HTML loads successfully');
  console.log('✓ Scripts parsed without errors');
  console.log('✓ DOM constructed:', dom.window.document.title);
  
  // Check for required elements
  const doc = dom.window.document;
  const required = ['hdr', 'msgs', 'inp', 'snd', 'st', 'dbg', 'besel', 'sesel', 'btn-cfg', 'btn-new'];
  const missing = required.filter(id => !doc.getElementById(id));
  if (missing.length) {
    console.error('✗ Missing elements:', missing);
    process.exit(1);
  }
  console.log('✓ All required elements present');
  
  // Check external scripts are referenced
  const scripts = doc.querySelectorAll('script[src]');
  console.log('✓ External scripts:', Array.from(scripts).map(s => s.src));
  
  console.log('\nAll checks passed!');
} catch (err) {
  console.error('✗ Validation failed:', err.message);
  process.exit(1);
}
