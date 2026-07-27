const fs = require('fs');
const path = require('path');

const replacements = {
  'â Œ': '❌',
  'â‚¹': '₹',
  'ðŸ ”': '🍔',
  'âœ…': '✅',
  'ðŸ§‘â€ ðŸ ³': '🧑‍🍳',
  'ðŸ ³': '🍳',
  'ðŸ› ï¸ ': '🛍️',
  'Ã¢Å“â€¦': '✅',
  'Ã¢Â Å’': '❌',
  'Ã°Å¸Å½â€°': '🎉',
  'Ã°Å¸â€œâ€¹': '📋',
  'Ã°Å¸â€œÂ¢': '📢',
  'Ã°Å¸Å½Å ': '🎊',
  'Ã°Å¸Å½Â¯': '🎯',
  'Ã°Å¸Å¡Â²': '🚲'
};

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else if (file.endsWith('.js')) {
      let content = fs.readFileSync(file, 'utf8');
      let changed = false;
      for (const [bad, good] of Object.entries(replacements)) {
        if (content.includes(bad)) {
          content = content.split(bad).join(good);
          changed = true;
        }
      }
      if (changed) {
        fs.writeFileSync(file, content, 'utf8');
        results.push(file);
      }
    }
  });
  return results;
}
console.log('Fixed files:', walk('s:/eqousy/Eqosy/Backend/src'));
