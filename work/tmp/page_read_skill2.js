import fs from 'fs';
const content = fs.readFileSync('assets/skills/ppt/SKILL.md', 'utf8');
// print from char 700
console.log(content.slice(700));