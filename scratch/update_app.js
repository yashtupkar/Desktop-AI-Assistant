const fs = require('fs');

let data = fs.readFileSync('src/App.jsx', 'utf8');

// Theming replacements
data = data.replace(/jarvis-blue/g, 'nova-primary');
data = data.replace(/jarvis-dark/g, 'nova-dark');
data = data.replace(/jarvis-panel/g, 'nova-panel');
data = data.replace(/J\.A\.R\.V\.I\.S\./g, 'N.O.V.A.');
data = data.replace(/JARVIS/g, 'NOVA');
data = data.replace(/Jarvis/g, 'Nova');
data = data.replace(/#00f0ff/g, '#a855f7'); // Update glow colors if hardcoded

fs.writeFileSync('src/App-updated.jsx', data);
