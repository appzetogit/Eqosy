import fs from 'fs';
import parser from '@babel/parser';

try {
  const code = fs.readFileSync('s:/eqousy/Eqosy/Frontend/src/modules/Food/components/restaurant/RestaurantNavbar.jsx', 'utf8');
  parser.parse(code, {
    sourceType: 'module',
    plugins: ['jsx']
  });
  console.log('Parsed successfully!');
} catch (err) {
  console.error('Parser Error:', err.message);
}
