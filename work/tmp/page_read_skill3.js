import fs from 'fs';
const content = fs.readFileSync('assets/skills/ppt/SKILL.md', 'utf8');
console.log(content.slice(2200));