const fs = require('fs');
let code = `
function processData(input) {
  return input * 2;
}

function helper() {
  const raw = [1,2,3];
  const result = processData(raw[0]);
  return result;
}

class Processor {
  constructor() { this.cache = {}; }
  run(items) {
    return items.map(item => processData(item));
  }
  // TODO: optimize processData later
}

const processDataArrow = (x) => x + 1;

const obj = {
  name: 'test',
  processData: function(x) { return x * 3; },
  transform: function(items) {
    return items.map(i => processData(i));
  }
};

module.exports = { processData, Processor, obj };
`;
let big = '';
for (let i = 0; i < 40; i++) {
  big += code.replace(/processData/g, 'processData') + '\n';
}
big += `
// This comment mentions processData but should be left as-is
const msg = "The processData function was used above";
console.log(processData(5));
`;
const totalCount = (big.match(/processData/g) || []).length;
const stringCount = (big.match(/"([^"]*)processData([^"]*)"/g) || []).length +
                    (big.match(/\/\/.*processData/g) || []).length;
console.log('Created legacy.js with ' + totalCount + ' total occurrences');
console.log('Non-rename targets (comments+strings): ' + stringCount);
fs.writeFileSync('D:\\#AlphaAgent\\legacy.js', big);
