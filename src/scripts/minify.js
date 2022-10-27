/* eslint-disable no-console */

// Минификация html
// Использовалось для оптимизации шаблонов писем

const hmin = require('html-minifier');
const fs = require('fs');

const options = {
  collapseWhitespace: true,
  minifyCSS: true,
  removeAttributeQuotes: true,
  removeComments: true,
  removeEmptyAttributes: true,
};

const fromIndex = process.argv.indexOf('-f');
const toIndex = process.argv.indexOf('-t');

if (fromIndex < 0) {
  console.log('What file need to minify? Set arg -f with path');
  process.exit(9);
}
if (toIndex < 0) {
  console.log('Where should minified file be? Set arg -t with path');
  process.exit(9);
}

const from = process.argv[fromIndex + 1];
const to = process.argv[toIndex + 1];

console.log(from, to);

if (!from) {
  console.log('What file need to minify? Set arg -f with path');
  process.exit(9);
}
if (!to) {
  console.log('Where should minified file be? Set arg -t with path');
  process.exit(9);
}

fs.readFile(from, { encoding: 'utf8' }, (err, data) => {
  if (err) {
    console.error('Error while reading file:', err);
    return;
  }
  const minified = hmin.minify(data, options);
  fs.writeFile(to, minified, (err2) => {
    if (err2) {
      console.error('Error while writing file:', err2);
    } else {
      console.log('Minified successfull');
    }
  });
});
