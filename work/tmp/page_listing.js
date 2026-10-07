import fs from 'fs';
import path from 'path';
const dirs = ['.', 'assets', 'assets/skills', 'assets/skills/ppt'];
for (const d of dirs) {
  try {
    const files = fs.readdirSync(d);
    console.log(d + ':', files);
  } catch (e) {
    console.log(d + ': ERR ' + e.message);
  }
}